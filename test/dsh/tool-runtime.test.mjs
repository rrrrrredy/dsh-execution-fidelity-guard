// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { ToolCallId } from "@deepseek-ai/dsh-llm";
import SystemPrompt from "@deepseek-ai/dsh-system-prompt";
import ToolRuntime, { defineContentToolFixture } from "@deepseek-ai/dsh-tools";
import * as Guard from "../../index.mjs";

const signal = new AbortController().signal;

function contract({ forbidden = ["action:install_local"], requiresUser = ["action:publish"] } = {}) {
  return {
    objective: "Complete repository work safely",
    primary_object: "repository",
    delivery_surface: ["repository"],
    scope: { include: ["source"], exclude: ["global configuration"] },
    must_and_must_not: { must: ["verify results"], must_not: [] },
    authorization: { allowed: ["action:read"], requires_user: requiresUser, forbidden },
    completion_evidence: [{ requirement: "evidence:test", acceptable_sources: ["test"] }],
  };
}

async function harness(contractValue, options = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "dsh-efg-tools-"));
  const contractPath = path.join(root, "contract.json");
  writeFileSync(contractPath, JSON.stringify(contractValue), "utf8");
  const receiptPath = options.receipts ? path.join(root, "receipts.ndjson") : "";
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(Guard, { mode: "balanced", contractPath, receiptPath, maxContinuationAttempts: 2 });
  return { ctx, root, receiptPath };
}

function shellTool(name, execute) {
  return defineContentToolFixture({
    name,
    description: "test shell",
    parameters: { command: { type: "string", required: true } },
    async execute(args) {
      await execute(args);
      return [{ type: "text", text: "ok" }];
    },
  });
}

test("real ToolRuntime denies a deterministic local install before the body", async () => {
  const { ctx, root } = await harness(contract());
  let ran = false;
  ctx.tools.register(shellTool(process.platform === "win32" ? "pwsh" : "bash", async () => { ran = true; }));
  const result = await ctx.tools.execute({
    signal,
    callId: ToolCallId("install-1"),
    name: process.platform === "win32" ? "pwsh" : "bash",
    arguments: { command: "npm install left-pad" },
  });
  assert.equal(result.isError, true);
  assert.equal(ran, false);
  assert.match(result.content[0].text, /Execution Fidelity Guard blocked/);
  await ctx.fiber.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("real ToolRuntime keeps an allowed read silent and observes a frozen result", async () => {
  const { ctx, root, receiptPath } = await harness(contract(), { receipts: true });
  let observed;
  const toolName = process.platform === "win32" ? "pwsh" : "bash";
  ctx.tools.register(shellTool(toolName, async () => {}));
  ctx.on("tools/result", (exec, result) => {
    observed = { exec: Object.isFrozen(exec), result: Object.isFrozen(result), content: Object.isFrozen(result.content) };
  });
  const result = await ctx.tools.execute({
    signal,
    callId: ToolCallId("read-1"),
    name: toolName,
    arguments: { command: "rg token=super-secret-value README.md" },
  });
  assert.equal(result.isError, false);
  assert.deepEqual(observed, { exec: true, result: true, content: true });
  const receipts = readFileSync(receiptPath, "utf8");
  assert.doesNotMatch(receipts, /super-secret-value/);
  assert.match(receipts, /arguments_sha256/);
  await ctx.fiber.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("requires-user maps to native ask and cannot execute without Host approval", async () => {
  const { ctx, root } = await harness(contract({ forbidden: [], requiresUser: ["action:install_local"] }));
  let ran = false;
  const toolName = process.platform === "win32" ? "pwsh" : "bash";
  ctx.tools.register(shellTool(toolName, async () => { ran = true; }));
  const result = await ctx.tools.execute({
    signal,
    callId: ToolCallId("ask-1"),
    name: toolName,
    arguments: { command: "npm install left-pad" },
  });
  assert.equal(result.isError, true);
  assert.equal(ran, false);
  await ctx.fiber.dispose();
  rmSync(root, { recursive: true, force: true });
});
