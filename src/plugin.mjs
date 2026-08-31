// SPDX-License-Identifier: Apache-2.0
import z from "@deepseek-ai/schemastery";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { classifyToolAction } from "./classify.mjs";
import { assistantTextForTurn, assessTurnStop } from "./completion.mjs";
import { loadContract, resolveContractPath } from "./contract.mjs";
import { deriveEvidence } from "./evidence.mjs";
import { decidePreTool, messageForDecision } from "./policy.mjs";
import { createContinuationReceipt, createDecisionReceipt } from "./receipts.mjs";

export const name = "execution-fidelity-guard";
export const inject = ["tools"];

export const Config = z.object({
  mode: z.union(["off", "shadow", "balanced"]).default("shadow"),
  contractPath: z.string().default(".execution-fidelity/contract.json"),
  receiptPath: z.string().default(""),
  maxContinuationAttempts: z.number().step(1).min(0).max(2).default(2),
});

function validateConfig(raw = {}) {
  const config = {
    mode: raw.mode ?? "shadow",
    contractPath: raw.contractPath ?? ".execution-fidelity/contract.json",
    receiptPath: raw.receiptPath ?? "",
    maxContinuationAttempts: raw.maxContinuationAttempts ?? 2,
  };
  if (!["off", "shadow", "balanced"].includes(config.mode)) throw new Error("execution-fidelity-guard: invalid mode");
  if (typeof config.contractPath !== "string" || !config.contractPath.trim()) throw new Error("execution-fidelity-guard: contractPath must be non-empty");
  if (typeof config.receiptPath !== "string") throw new Error("execution-fidelity-guard: receiptPath must be a string");
  if (config.receiptPath.trim()) {
    throw new Error("execution-fidelity-guard: disk receipt persistence is disabled in this alpha; keep receiptPath empty");
  }
  if (!Number.isInteger(config.maxContinuationAttempts) || config.maxContinuationAttempts < 0 || config.maxContinuationAttempts > 2) {
    throw new Error("execution-fidelity-guard: maxContinuationAttempts must be an integer from 0 to 2");
  }
  return config;
}

function pushBounded(list, value, maximum = 512) {
  list.push(value);
  if (list.length > maximum) list.splice(0, list.length - maximum);
}

export function apply(ctx, rawConfig = {}) {
  const config = validateConfig(rawConfig);
  const pending = new WeakMap();
  const evidenceByAgent = new WeakMap();
  const receiptsByAgent = new WeakMap();
  const attemptsByAgent = new WeakMap();
  const unownedEvidence = [];
  const unownedReceipts = [];

  function recordsFor(map, agent, fallback) {
    if (!agent) return fallback;
    let records = map.get(agent);
    if (!records) {
      records = [];
      map.set(agent, records);
    }
    return records;
  }

  async function bindingFor(agent) {
    return loadContract(resolveContractPath(agent, config.contractPath));
  }

  function recordReceipt(agent, receipt) {
    pushBounded(recordsFor(receiptsByAgent, agent, unownedReceipts), receipt);
  }

  ctx.tools.guard((exec) => {
    const state = pending.get(exec);
    if (state?.decision?.decision !== "block") return undefined;
    return messageForDecision(state.decision, state.binding, state.action);
  });

  ctx.on("tools/pre-execute", async (exec, next) => {
    const binding = await bindingFor(exec.agent);
    const action = classifyToolAction(exec);
    const decision = decidePreTool({ binding, action, mode: config.mode });
    const state = { binding, action, decision };
    pending.set(exec, state);
    recordReceipt(exec.agent, createDecisionReceipt({ binding, exec, action, decision }));
    const message = messageForDecision(decision, binding, action);

    if (decision.decision === "block") return { kind: "deny", reason: message };
    if (decision.decision === "ask") return { kind: "ask", reason: message };
    if (decision.decision === "remind" && exec.agent && message) {
      exec.agent.inject(createUserMessage({
        content: [{ type: "text", text: message }],
        source: { kind: "plugin", plugin: name, form: "notice", summary: "Execution fidelity advisory" },
      }));
    }
    return next();
  }, { prepend: true });

  ctx.on("tools/result", (exec, result) => {
    const state = pending.get(exec);
    if (!state) return;
    const evidence = deriveEvidence(exec, result, state.binding, state.action);
    pushBounded(recordsFor(evidenceByAgent, exec.agent, unownedEvidence), evidence);
    recordReceipt(exec.agent, createDecisionReceipt({
      binding: state.binding,
      exec,
      action: state.action,
      decision: state.decision,
      phase: "tool_result",
      result,
    }));
    pending.delete(exec);
  });

  ctx.on("agent/turn-stopping", async ({ agent, turn, signal }) => {
    if (config.mode === "off" || config.maxContinuationAttempts === 0 || signal.aborted) return;
    const binding = await bindingFor(agent);
    const assistantText = assistantTextForTurn(agent, turn);
    const assessment = assessTurnStop(binding, recordsFor(evidenceByAgent, agent, unownedEvidence), assistantText);
    if (!assessment.shouldVerify || assessment.complete) return;
    const contractKey = binding.envelope.contract_ref + ":" + binding.envelope.contract_version + ":" + turn;
    const prior = attemptsByAgent.get(agent);
    const attempt = prior?.key === contractKey ? prior.count : 0;
    if (attempt >= config.maxContinuationAttempts) return;
    const nextAttempt = attempt + 1;
    attemptsByAgent.set(agent, { key: contractKey, count: nextAttempt });
    const receipt = createContinuationReceipt({ binding, turn, missing: assessment.missing, attempt: nextAttempt });
    recordReceipt(agent, receipt);
    const missing = assessment.missing.slice(0, 5).map((item) => item.requirement).join("; ");
    agent.steer(createUserMessage({
      content: [{
        type: "text",
        text: "Execution Fidelity Guard found a completion claim without current required evidence. Continue verification before final delivery. Missing: " + missing,
      }],
      source: { kind: "plugin", plugin: name, form: "notice", summary: "Completion evidence required" },
    }));
  });
}
