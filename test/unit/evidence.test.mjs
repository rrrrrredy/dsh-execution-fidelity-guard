// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { classifyToolAction } from "../../src/classify.mjs";
import { assessCompletionEvidence, deriveEvidence } from "../../src/evidence.mjs";
import { assessTurnStop, hasCompletionClaim } from "../../src/completion.mjs";

const binding = {
  status: "bound",
  envelope: { contract_ref: "lite:test", contract_version: 1 },
  contract: { completion_evidence: [{ requirement: "evidence:test", acceptable_sources: ["test"] }] },
};

test("authoritative tools/result success satisfies an exact evidence requirement", () => {
  const exec = { callId: "c1", name: "bash", arguments: { command: "npm test" } };
  const action = classifyToolAction(exec);
  const record = deriveEvidence(exec, { isError: false, content: [{ type: "text", text: "pass" }] }, binding, action);
  assert.equal(record.evidence.kind, "test");
  assert.equal(record.evidence.status, "pass");
  assert.equal(assessCompletionEvidence(binding, [record]).complete, true);
});

test("a newer failure invalidates an older pass", () => {
  const exec = { callId: "c1", name: "run_tests", arguments: {} };
  const action = classifyToolAction(exec);
  const pass = deriveEvidence(exec, { isError: false, content: [] }, binding, action, new Date("2026-08-31T00:00:00Z"));
  const fail = deriveEvidence(exec, { isError: true, content: [] }, binding, action, new Date("2026-08-31T00:01:00Z"));
  assert.equal(assessCompletionEvidence(binding, [pass, fail]).complete, false);
});

test("only a direct release command can satisfy release evidence", () => {
  const releaseBinding = {
    ...binding,
    contract: { completion_evidence: [{ requirement: "evidence:release", acceptable_sources: ["release"] }] },
  };
  for (const command of [
    "git push origin main",
    "gh pr create --title test",
    "npm publish",
  ]) {
    const exec = { callId: "negative-" + command, name: "bash", arguments: { command } };
    const action = classifyToolAction(exec);
    const record = deriveEvidence(exec, { isError: false, content: [] }, releaseBinding, action);
    assert.notEqual(record.evidence.kind, "release", command);
    assert.equal(record.requirement_refs.length, 0, command);
    assert.equal(assessCompletionEvidence(releaseBinding, [record]).complete, false, command);
  }
  for (const command of [
    "gh release view v0.1.0-alpha.2",
    "gh --repo rrrrrredy/dsh-execution-fidelity-guard release create v0.1.0-alpha.2",
  ]) {
    const exec = { callId: "positive-" + command, name: "bash", arguments: { command } };
    const action = classifyToolAction(exec);
    const record = deriveEvidence(exec, { isError: false, content: [] }, releaseBinding, action);
    assert.equal(record.evidence.kind, "release", command);
    assert.equal(assessCompletionEvidence(releaseBinding, [record]).complete, true, command);
  }
});

test("completion claims continue only when required evidence is missing", () => {
  assert.equal(hasCompletionClaim("All tests passed. Done."), true);
  assert.equal(hasCompletionClaim("Unable to verify; not done."), false);
  const assessment = assessTurnStop(binding, [], "All tests passed. Done.");
  assert.equal(assessment.shouldVerify, true);
  assert.equal(assessment.complete, false);
  assert.equal(assessment.missing.length, 1);
});
