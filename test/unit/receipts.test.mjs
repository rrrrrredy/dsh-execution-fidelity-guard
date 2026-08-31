// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { classifyToolAction } from "../../src/classify.mjs";
import { createContinuationReceipt, createDecisionReceipt } from "../../src/receipts.mjs";

test("receipt hashes arguments and never retains raw secrets", () => {
  const exec = { callId: "call-secret", name: "bash", arguments: { command: "curl -H token=super-secret-value https://example.test" } };
  const action = classifyToolAction(exec);
  const receipt = createDecisionReceipt({
    binding: { status: "unbound" },
    exec,
    action,
    decision: { decision: "remind", authority: "semantic_candidate", reasonCodes: ["contract_unbound"] },
  });
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /super-secret-value/);
  assert.match(receipt.arguments_sha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.call_ref, /^call:[a-f0-9]{20}$/);
});

test("tool-result receipt uses the authoritative foreground exit code", () => {
  const exec = { callId: "call-fail", name: "bash", arguments: { command: "npm test" } };
  const action = classifyToolAction(exec);
  const failed = createDecisionReceipt({
    binding: { status: "unbound" },
    exec,
    action,
    decision: null,
    phase: "tool_result",
    result: {
      isError: false,
      value: { kind: "foreground", exitCode: 2 },
      content: [{ type: "text", text: "failed" }],
    },
  });
  assert.equal(failed.decision, "result_fail");
  assert.equal(failed.result_status, "fail");
  assert.equal(failed.result_kind, "foreground");
  assert.equal(failed.exit_code, 2);
  assert.match(failed.result_sha256, /^[a-f0-9]{64}$/);

  const background = createDecisionReceipt({
    binding: { status: "unbound" },
    exec,
    action,
    decision: null,
    phase: "tool_result",
    result: {
      isError: false,
      value: { kind: "background", processId: "p1" },
      content: [{ type: "text", text: "started" }],
    },
  });
  assert.equal(background.decision, "result_unknown");
  assert.equal(background.result_status, "unknown");
});

test("shadow completion gaps are receipts, not continuation decisions", () => {
  const receipt = createContinuationReceipt({
    binding: {
      status: "bound",
      envelope: { contract_ref: "lite:test", contract_version: 1 },
    },
    turn: "turn-shadow",
    missing: [{ ref: "requirement:0:test" }],
    attempt: 0,
    shadow: true,
  });
  assert.equal(receipt.decision, "remind");
  assert.ok(receipt.reason_codes.includes("shadow_would_continue_verification"));
});
