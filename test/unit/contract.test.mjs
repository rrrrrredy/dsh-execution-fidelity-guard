// SPDX-License-Identifier: Apache-2.0
import test from "node:test";
import assert from "node:assert/strict";
import { parseContractDocument, validateTaskContractLite } from "../../src/contract.mjs";
import { sha256 } from "../../src/canonical.mjs";

function contract() {
  return {
    objective: "Ship the repository safely",
    primary_object: "repository",
    delivery_surface: ["GitHub"],
    scope: { include: ["source"], exclude: ["global config"] },
    must_and_must_not: { must: ["run tests"], must_not: ["action:install_local"] },
    authorization: { allowed: ["action:read"], requires_user: ["action:publish"], forbidden: ["action:install_local"] },
    completion_evidence: [{ requirement: "evidence:test", acceptable_sources: ["test"] }],
  };
}

test("accepts the exact seven-field TaskContractLite and derives stable identity", () => {
  const value = contract();
  assert.deepEqual(validateTaskContractLite(value), []);
  const first = parseContractDocument(value);
  const second = parseContractDocument({ ...value, scope: { exclude: ["global config"], include: ["source"] } });
  assert.equal(first.status, "bound");
  assert.equal(first.envelope.contract_ref, second.envelope.contract_ref);
  assert.match(first.envelope.contract_ref, /^lite:[a-f0-9]{20}$/);
});

test("rejects extra fields, placeholders, and unsupported action tags", () => {
  const value = contract();
  value.extra = true;
  value.objective = "Replace with the exact user-requested outcome.";
  value.authorization.forbidden = ["action:teleport"];
  const errors = validateTaskContractLite(value).join("\n");
  assert.match(errors, /unsupported field: extra/);
  assert.match(errors, /generated init placeholders/);
  assert.match(errors, /unsupported action rule tag/);
});

test("accepts the canonical evidence vocabulary without weakening action rules", () => {
  for (const completionEvidence of [
    [{ requirement: "evidence:user", acceptable_sources: ["user"] }],
    [{ requirement: "evidence:release", acceptable_sources: ["release"] }],
    [{ requirement: "A reviewer approved the result", acceptable_sources: ["user"] }],
  ]) {
    const value = contract();
    value.completion_evidence = completionEvidence;
    assert.deepEqual(validateTaskContractLite(value), []);
    assert.equal(parseContractDocument(value).status, "bound");
  }
});

test("matches canonical 1.0 duplicate semantics", () => {
  const value = contract();
  value.scope.include = ["source", "source"];
  value.must_and_must_not.must = ["run tests", "run tests"];
  value.authorization.forbidden = ["action:install_local", "action:install_local"];
  value.completion_evidence[0].acceptable_sources = ["test", "test"];
  assert.deepEqual(validateTaskContractLite(value), []);
  value.delivery_surface = ["GitHub", "GitHub"];
  assert.match(validateTaskContractLite(value).join("\n"), /delivery_surface must contain unique items/);
});

test("accepts a versioned provider projection and rejects a mismatched digest", () => {
  const projection = contract();
  const envelope = {
    schema_version: "1.0",
    contract_ref: "intent:task-1",
    contract_version: 3,
    source: "user-intent-plugin",
    source_message_refs: ["message:1"],
    snapshot_sha256: sha256(projection),
    updated_at: "2026-08-31T00:00:00.000Z",
  };
  assert.equal(parseContractDocument({ envelope, projection }).status, "bound");
  assert.equal(parseContractDocument({ envelope: { ...envelope, snapshot_sha256: "0".repeat(64) }, projection }).status, "invalid");
});

test("provider updated_at uses strict RFC 3339 calendar validation", () => {
  const projection = contract();
  const envelope = {
    schema_version: "1.0",
    contract_ref: "intent:bad-date",
    contract_version: 1,
    source: "user-intent-plugin",
    source_message_refs: [],
    snapshot_sha256: sha256(projection),
    updated_at: "2026-02-31T00:00:00.000Z",
  };
  assert.equal(parseContractDocument({ envelope, projection }).status, "invalid");
});
