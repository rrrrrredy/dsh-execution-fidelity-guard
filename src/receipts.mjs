// SPDX-License-Identifier: Apache-2.0
import { makeId, sha256 } from "./canonical.mjs";

function contractIdentity(binding) {
  return binding.status === "bound"
    ? { contract_ref: binding.envelope.contract_ref, contract_version: binding.envelope.contract_version }
    : { contract_ref: "unbound", contract_version: 1 };
}

export function createDecisionReceipt({ binding, exec, action, decision, phase = "pre_tool", result = null, now = new Date() }) {
  return {
    schema_version: "1.0",
    receipt_id: makeId("rc_", [String(exec?.callId ?? "none"), phase]),
    observed_at: now.toISOString(),
    ...contractIdentity(binding),
    phase,
    call_ref: "call:" + sha256(String(exec?.callId ?? "none")).slice(0, 20),
    tool: String(exec?.name ?? "unknown"),
    arguments_sha256: sha256(exec?.arguments ?? null),
    action_tags: [...(action?.tags ?? [])],
    decision: decision?.decision ?? (result?.isError ? "result_fail" : "result_pass"),
    authority: decision?.authority ?? "dsh_tools_result",
    reason_codes: [...(decision?.reasonCodes ?? [])],
    result_status: result === null ? null : result.isError ? "fail" : "pass",
  };
}

export function createContinuationReceipt({ binding, turn, missing, attempt, now = new Date() }) {
  return {
    schema_version: "1.0",
    receipt_id: makeId("rc_", [String(turn), "continuation", String(attempt)]),
    observed_at: now.toISOString(),
    ...contractIdentity(binding),
    phase: "turn_stopping",
    turn,
    decision: "continue_verification",
    authority: "evidence_rule",
    reason_codes: ["completion_claim_missing_required_evidence"],
    attempt,
    missing_requirement_refs: missing.map((item) => item.ref),
  };
}

