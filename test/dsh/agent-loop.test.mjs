// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Context } from "@deepseek-ai/cordis";
import AgentLoop from "@deepseek-ai/dsh-agent-loop";
import { mountAgentLoopTestDependencies } from "@deepseek-ai/dsh-agent-loop-testkit";
import { LlmAdapter, ToolCallId, createUserMessage } from "@deepseek-ai/dsh-llm";
import { SessionId } from "@deepseek-ai/dsh-session";
import SessionProjectionRegistry from "@deepseek-ai/dsh-session-projection";
import { defineContentToolFixture } from "@deepseek-ai/dsh-tools";
import * as Guard from "../../index.mjs";

function textResponse(text) {
  return [
    { type: "block-start", index: 0, blockType: "text" },
    { type: "text-delta", index: 0, text },
    { type: "block-end", index: 0, block: { type: "text", text } },
    { type: "usage", usage: { inputTokens: 10, outputTokens: text.length } },
    { type: "finish", reason: { kind: "stop" } },
  ];
}

function toolCallResponse(rawCallId, name, args) {
  const id = ToolCallId(rawCallId);
  const argumentsJson = JSON.stringify(args);
  return [
    { type: "block-start", index: 0, blockType: "tool-call" },
    { type: "tool-call-delta", index: 0, id, name, argumentsDelta: argumentsJson },
    { type: "block-end", index: 0, block: { type: "tool-call", id, name, arguments: argumentsJson } },
    { type: "usage", usage: { inputTokens: 10, outputTokens: 5 } },
    { type: "finish", reason: { kind: "tool-calls" } },
  ];
}

class ScriptedAdapter extends LlmAdapter {
  constructor(script) {
    super();
    this.script = [...script];
    this.requests = [];
  }
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model });
  }
  async * stream(options) {
    this.requests.push(options);
    const chunks = this.script.shift();
    if (!chunks) throw new Error("ScriptedAdapter exhausted");
    for (const chunk of chunks) yield chunk;
  }
}

function contract() {
  return {
    objective: "Do the work and verify it",
    primary_object: "repository",
    delivery_surface: ["repository"],
    scope: { include: ["source"], exclude: [] },
    must_and_must_not: { must: ["verify tests"], must_not: [] },
    authorization: { allowed: ["action:read"], requires_user: [], forbidden: [] },
    completion_evidence: [{ requirement: "evidence:test", acceptable_sources: ["test"] }],
  };
}

async function harness(adapter) {
  const root = mkdtempSync(path.join(os.tmpdir(), "dsh-efg-loop-"));
  const contractPath = path.join(root, "contract.json");
  writeFileSync(contractPath, JSON.stringify(contract()), "utf8");
  const ctx = new Context();
  await mountAgentLoopTestDependencies(ctx);
  await ctx.plugin(SessionProjectionRegistry);
  await ctx.plugin(AgentLoop, { agents: [] });
  await ctx.plugin(Guard, { mode: "balanced", contractPath, receiptPath: "", maxContinuationAttempts: 2 });
  ctx.llm.registerAdapter(["mock"], adapter);
  const agent = ctx.agentLoop.create(SessionId("efg-agent"), { provider: "mock", model: "mock" });
  return { ctx, agent, root };
}

function waitForIdle(ctx, agent) {
  return new Promise((resolve) => {
    const dispose = ctx.on("agent/status", ({ agent: subject, status }) => {
      if (subject === agent && status === "idle") {
        dispose();
        resolve();
      }
    });
  });
}

async function send(ctx, agent, text) {
  const idle = waitForIdle(ctx, agent);
  agent.followup(createUserMessage({ content: [{ type: "text", text }], source: { kind: "user" } }));
  await idle;
}

test("real AgentLoop continues a completion claim at most twice when evidence is absent", async () => {
  const adapter = new ScriptedAdapter([
    textResponse("All tests passed. Done."),
    textResponse("Done."),
    textResponse("Completed."),
  ]);
  const { ctx, agent, root } = await harness(adapter);
  await send(ctx, agent, "finish the task");
  assert.equal(adapter.requests.length, 3);
  const notices = agent.session.events.filter((event) => event.type === "user/message" && event.data.source?.plugin === "execution-fidelity-guard");
  assert.equal(notices.length, 2);
  await ctx.fiber.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("real AgentLoop accepts current passing tool evidence without an extra verification step", async () => {
  const adapter = new ScriptedAdapter([
    toolCallResponse("tests-1", "run_tests", {}),
    textResponse("All tests passed. Done."),
  ]);
  const { ctx, agent, root } = await harness(adapter);
  ctx.tools.register(defineContentToolFixture({
    name: "run_tests",
    description: "run tests",
    parameters: {},
    async execute() { return [{ type: "text", text: "12 tests passed" }]; },
  }));
  await send(ctx, agent, "run tests and finish");
  assert.equal(adapter.requests.length, 2);
  const notices = agent.session.events.filter((event) => event.type === "user/message" && event.data.source?.plugin === "execution-fidelity-guard");
  assert.equal(notices.length, 0);
  await ctx.fiber.dispose();
  rmSync(root, { recursive: true, force: true });
});
