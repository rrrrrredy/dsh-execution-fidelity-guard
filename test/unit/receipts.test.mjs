// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { classifyToolAction } from "../../src/classify.mjs";
import { createDecisionReceipt } from "../../src/receipts.mjs";

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

