// SPDX-License-Identifier: Apache-2.0
import { sha256 } from "./canonical.mjs";

const STRUCTURED_RULE = /^(action|tool|command-prefix):(.+)$/i;

export function parseRule(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(STRUCTURED_RULE);
  if (!match) return { raw, structured: false };
  return { raw, structured: true, kind: match[1].toLowerCase(), value: match[2].trim().toLowerCase() };
}

function matchesRule(rule, action) {
  if (!rule.structured || !rule.value) return false;
  if (rule.kind === "action") {
    const aliases = {
      write: ["write_workspace"],
      external: ["external_side_effect", "publish", "network"],
      destructive: ["destructive", "delete"],
    };
    return (aliases[rule.value] ?? [rule.value]).some((value) => action.tags.includes(value));
  }
  if (rule.kind === "tool") return action.toolName.toLowerCase() === rule.value;
  if (rule.kind === "command-prefix") return action.command.trim().toLowerCase().startsWith(rule.value);
  return false;
}

function decision(overrides = {}) {
  return {
    decision: "continue",
    authority: "deterministic_rule",
    severity: "low",
    reasonCodes: ["no_material_conflict"],
    ruleIds: [],
    visibility: "silent",
    reversible: true,
    coverage: "observed",
    unlock: null,
    ...overrides,
  };
}

function ruleId(bucket, rule) {
  return bucket + ":" + sha256(rule.raw).slice(0, 16);
}

export function decidePreTool({ binding, action, mode = "shadow" }) {
  if (mode === "off") return decision({ reasonCodes: ["guard_disabled"], coverage: "unobserved" });
  if (binding.status !== "bound") {
    if (!action.highRisk) return decision({ reasonCodes: ["contract_unbound"], coverage: "partial", reversible: action.reversible });
    return decision({
      decision: "remind",
      authority: "semantic_candidate",
      severity: "medium",
      reasonCodes: ["contract_unbound", "high_risk_action_uncovered"],
      visibility: "model",
      coverage: "partial",
      reversible: action.reversible,
      unlock: "Bind a valid task contract before relying on this guard.",
    });
  }

  const forbidden = [
    ...binding.contract.authorization.forbidden.map((value) => ["forbidden", parseRule(value)]),
    ...binding.contract.must_and_must_not.must_not.map((value) => ["must_not", parseRule(value)]),
  ];
  for (const [bucket, rule] of forbidden) {
    if (!matchesRule(rule, action)) continue;
    if (mode === "shadow") {
      return decision({
        decision: "remind",
        severity: "high",
        reasonCodes: ["shadow_would_block", "explicit_contract_conflict"],
        ruleIds: [ruleId(bucket, rule)],
        visibility: "model",
        reversible: action.reversible,
      });
    }
    return decision({
      decision: "block",
      severity: "high",
      reasonCodes: ["explicit_contract_conflict"],
      ruleIds: [ruleId(bucket, rule)],
      visibility: "user",
      reversible: action.reversible,
      unlock: "Change the canonical contract or choose an action outside the matched " + rule.kind + " rule.",
    });
  }

  for (const value of binding.contract.authorization.requires_user) {
    const rule = parseRule(value);
    if (!matchesRule(rule, action)) continue;
    if (mode === "shadow") {
      return decision({
        decision: "remind",
        severity: "medium",
        reasonCodes: ["shadow_would_ask", "explicit_user_authorization_required"],
        ruleIds: [ruleId("requires_user", rule)],
        visibility: "model",
        reversible: action.reversible,
      });
    }
    return decision({
      decision: "ask",
      severity: "medium",
      reasonCodes: ["explicit_user_authorization_required"],
      ruleIds: [ruleId("requires_user", rule)],
      visibility: "user",
      reversible: action.reversible,
      unlock: "Approve this exact call once in the Host, reject it, or publish a new canonical contract version.",
    });
  }

  const constraints = [
    ...binding.contract.authorization.forbidden,
    ...binding.contract.authorization.requires_user,
    ...binding.contract.must_and_must_not.must_not,
  ].map(parseRule);
  if (action.highRisk && constraints.some((rule) => !rule.structured)) {
    return decision({
      decision: "remind",
      authority: "semantic_candidate",
      severity: "medium",
      reasonCodes: ["semantic_constraint_candidate", "no_deterministic_match"],
      visibility: "model",
      reversible: action.reversible,
      unlock: "Compare the pending action with the natural-language constraints.",
    });
  }

  if (binding.contract.authorization.allowed.map(parseRule).some((rule) => matchesRule(rule, action))) {
    return decision({ reasonCodes: ["explicit_contract_allowance"], reversible: action.reversible });
  }
  return decision({ reversible: action.reversible });
}

export function messageForDecision(result, binding, action) {
  const ref = binding.status === "bound"
    ? binding.envelope.contract_ref + " v" + binding.envelope.contract_version
    : "unbound contract";
  const label = action.tags.join(", ");
  if (result.decision === "block") return "Execution Fidelity Guard blocked this " + label + " action under " + ref + ". " + result.unlock;
  if (result.decision === "ask") return "Execution Fidelity Guard requires approval for this " + label + " action under " + ref + ". " + result.unlock;
  if (result.decision === "remind") return ("Execution Fidelity Guard advisory for " + ref + ": " + result.reasonCodes.join(", ") + ". " + (result.unlock ?? "")).trim();
  return "";
}

