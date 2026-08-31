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
  const record = deriveEvidence(exec, {
    isError: false,
    value: { kind: "foreground", exitCode: 0 },
    content: [{ type: "text", text: "pass" }],
  }, binding, action);
  assert.equal(record.evidence.kind, "test");
  assert.equal(record.evidence.status, "pass");
  assert.equal(assessCompletionEvidence(binding, [record]).complete, true);
});

test("official shell success wrappers cannot hide a nonzero or background result", () => {
  const exec = { callId: "shell-failure", name: "bash", arguments: { command: "npm test" } };
  const action = classifyToolAction(exec);
  const failed = deriveEvidence(exec, {
    isError: false,
    value: { kind: "foreground", exitCode: 1 },
    content: [{ type: "text", text: "1 test failed\n[exit code: 1]" }],
  }, binding, action);
  assert.equal(failed.evidence.status, "fail");
  assert.equal(assessCompletionEvidence(binding, [failed]).complete, false);

  const background = deriveEvidence({ ...exec, callId: "shell-background" }, {
    isError: false,
    value: { kind: "background", processId: "p1" },
    content: [{ type: "text", text: "started" }],
  }, binding, action);
  assert.equal(background.evidence.status, "unknown");
  assert.equal(background.evidence.coverage, "partial_requirement");
  assert.equal(assessCompletionEvidence(binding, [background]).complete, false);
});

test("a newer failure invalidates an older pass", () => {
  const exec = { callId: "c1", name: "bash", arguments: { command: "npm test" } };
  const action = classifyToolAction(exec);
  const pass = deriveEvidence(exec, {
    isError: false,
    value: { kind: "foreground", exitCode: 0 },
    content: [],
  }, binding, action, new Date("2026-08-31T00:00:00Z"));
  const fail = deriveEvidence(exec, { isError: true, content: [] }, binding, action, new Date("2026-08-31T00:01:00Z"));
  assert.equal(pass.evidence.status, "pass");
  assert.equal(fail.evidence.status, "fail");
  assert.equal(assessCompletionEvidence(binding, [pass, fail]).complete, false);
});

test("release-like commands stay generic and cannot manufacture release evidence", () => {
  const releaseBinding = {
    ...binding,
    contract: { completion_evidence: [{ requirement: "evidence:release", acceptable_sources: ["release"] }] },
  };
  for (const command of [
    "git push origin main",
    "gh pr create --title test",
    "npm publish",
    "gh release view v0.1.0-alpha.2",
    "gh --repo cli/cli release view",
    "gh release view --help",
  ]) {
    const exec = { callId: "negative-" + command, name: "bash", arguments: { command } };
    const action = classifyToolAction(exec);
    const record = deriveEvidence(exec, { isError: false, content: [] }, releaseBinding, action);
    assert.equal(record.evidence.kind, "command", command);
    assert.equal(record.requirement_refs.length, 0, command);
    assert.equal(assessCompletionEvidence(releaseBinding, [record]).complete, false, command);
  }
});

test("test help and collection commands do not satisfy test evidence", () => {
  for (const command of [
    "node --test --help",
    "pytest --help",
    "pytest --collect-only",
    "go test -list .",
    "cargo test -- --list",
    "dotnet test --list-tests",
    "npm test --if-present",
    "npm run test --if-present",
    "cargo test --no-run",
  ]) {
    const exec = { callId: "inspection-" + command, name: "bash", arguments: { command } };
    const action = classifyToolAction(exec);
    const record = deriveEvidence(exec, { isError: false, content: [] }, binding, action);
    assert.notEqual(record.evidence.kind, "test", command);
    assert.equal(assessCompletionEvidence(binding, [record]).complete, false, command);
  }
});

test("tool names containing test do not create automatic test evidence", () => {
  for (const name of [
    "mcp__server__list_tests",
    "mcp__db__test_connection",
    "mcp__server__get_test_status",
    "run_tests",
  ]) {
    const exec = { callId: "named-" + name, name, arguments: {} };
    const action = classifyToolAction(exec);
    const record = deriveEvidence(exec, { isError: false, content: [] }, binding, action);
    assert.notEqual(record.evidence.kind, "test", name);
    assert.equal(assessCompletionEvidence(binding, [record]).complete, false, name);
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
