// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { classifyToolAction } from "../../src/classify.mjs";
import { decidePreTool } from "../../src/policy.mjs";

function binding(overrides = {}) {
  return {
    status: "bound",
    envelope: { contract_ref: "lite:test", contract_version: 1 },
    contract: {
      authorization: { allowed: ["action:read"], requires_user: ["action:publish"], forbidden: ["action:install_local"] },
      must_and_must_not: { must: [], must_not: [] },
      ...overrides,
    },
  };
}

test("classifies installation across bash and PowerShell hosts", () => {
  for (const [name, command] of [["bash", "npm install left-pad"], ["pwsh", "python -m pip install demo"], ["powershell", "winget install Demo.App"]]) {
    const action = classifyToolAction({ name, arguments: { command } });
    assert.ok(action.tags.includes("install_local"), name + " should classify install");
    assert.equal(action.highRisk, true);
  }
});

test("balanced blocks deterministic conflicts while shadow only reminds", () => {
  const action = classifyToolAction({ name: "bash", arguments: { command: "npm install left-pad" } });
  assert.equal(decidePreTool({ binding: binding(), action, mode: "balanced" }).decision, "block");
  const shadow = decidePreTool({ binding: binding(), action, mode: "shadow" });
  assert.equal(shadow.decision, "remind");
  assert.ok(shadow.reasonCodes.includes("shadow_would_block"));
});

test("uses native ask for user-owned publication authority", () => {
  const action = classifyToolAction({ name: "bash", arguments: { command: "git push origin main" } });
  const result = decidePreTool({ binding: binding(), action, mode: "balanced" });
  assert.equal(result.decision, "ask");
  assert.match(result.unlock, /Host/);
});

test("keeps reversible reads silent", () => {
  for (const exec of [{ name: "bash", arguments: { command: "rg --files" } }, { name: "pwsh", arguments: { command: "Get-Content README.md" } }]) {
    const action = classifyToolAction(exec);
    const result = decidePreTool({ binding: binding(), action, mode: "balanced" });
    assert.equal(result.decision, "continue");
    assert.equal(result.visibility, "silent");
  }
});

