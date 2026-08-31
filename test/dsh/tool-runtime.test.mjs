// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

async function harness(contractValue) {
  const root = mkdtempSync(path.join(os.tmpdir(), "dsh-efg-tools-"));
  const contractPath = path.join(root, "contract.json");
  writeFileSync(contractPath, JSON.stringify(contractValue), "utf8");
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ToolRuntime);
  await ctx.plugin(Guard, { mode: "balanced", contractPath, receiptPath: "", maxContinuationAttempts: 2 });
  return { ctx, root };
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

test("real ToolRuntime denies wrapped and option-prefixed installs before the body", async () => {
  const { ctx, root } = await harness(contract());
  let calls = 0;
  const toolName = process.platform === "win32" ? "pwsh" : "bash";
  ctx.tools.register(shellTool(toolName, async () => { calls += 1; }));
  const commands = [
    "python3.11 -m pip install pytest",
    "env -u CI npm install lodash",
    "env -C app npm install lodash",
    "npm --prefix . install lodash",
    "pip --disable-pip-version-check install pytest",
  ];
  for (const [index, command] of commands.entries()) {
    const result = await ctx.tools.execute({
      signal,
      callId: ToolCallId("wrapped-install-" + index),
      name: toolName,
      arguments: { command },
    });
    assert.equal(result.isError, true, command);
  }
  assert.equal(calls, 0);
  await ctx.fiber.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("real ToolRuntime keeps an allowed read silent and observes a frozen result", async () => {
  const { ctx, root } = await harness(contract());
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
  await ctx.fiber.dispose();
  rmSync(root, { recursive: true, force: true });
});

test("disk receipt persistence is rejected during plugin load", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dsh-efg-config-"));
  const contractPath = path.join(root, "contract.json");
  writeFileSync(contractPath, JSON.stringify(contract()), "utf8");
  const ctx = new Context();
  await ctx.plugin(SystemPrompt, {});
  await ctx.plugin(ToolRuntime);
  await assert.rejects(
    async () => ctx.plugin(Guard, {
      mode: "balanced",
      contractPath,
      receiptPath: path.join(root, "receipts.ndjson"),
      maxContinuationAttempts: 2,
    }),
    /disk receipt persistence is disabled/,
  );
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
