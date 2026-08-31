// SPDX-License-Identifier: Apache-2.0
import { makeId, sha256 } from "./canonical.mjs";
import { inferToolOutcome } from "./outcome.mjs";

function contractIdentity(binding) {
  return binding.status === "bound"
    ? { contract_ref: binding.envelope.contract_ref, contract_version: binding.envelope.contract_version }
    : { contract_ref: "unbound", contract_version: 1 };
}

export function createDecisionReceipt({ binding, exec, action, decision, phase = "pre_tool", result = null, now = new Date() }) {
  const outcome = result === null
    ? null
    : inferToolOutcome(result, action?.toolName ?? exec?.name, action?.command ?? "");
  return {
    schema_version: "1.0",
    receipt_id: makeId("rc_", [String(exec?.callId ?? "none"), phase]),
    observed_at: now.toISOString(),
    ...contractIdentity(binding),
    phase,
    call_ref: "call:" + sha256(String(exec?.callId ?? "none")).slice(0, 20),
    tool: String(exec?.name ?? "unknown"),
    arguments_sha256: sha256(exec?.arguments ?? null),
    result_sha256: result === null
      ? null
      : sha256({
          isError: result.isError,
          value: result.value ?? null,
          content: result.content,
          error: result.error ?? null,
        }),
    action_tags: [...(action?.tags ?? [])],
    decision: decision?.decision ??
      (outcome?.status === "pass"
        ? "result_pass"
        : outcome?.status === "fail"
          ? "result_fail"
          : "result_unknown"),
    authority: decision?.authority ?? "dsh_tools_result",
    reason_codes: [...(decision?.reasonCodes ?? [])],
    result_status: outcome?.status ?? null,
    result_kind: outcome?.kind ?? null,
    exit_code: outcome?.exitCode ?? null,
  };
}

export function createContinuationReceipt({
  binding,
  turn,
  missing,
  attempt,
  shadow = false,
  now = new Date(),
}) {
  return {
    schema_version: "1.0",
    receipt_id: makeId("rc_", [String(turn), "continuation", String(attempt)]),
    observed_at: now.toISOString(),
    ...contractIdentity(binding),
    phase: "turn_stopping",
    turn,
    decision: shadow ? "remind" : "continue_verification",
    authority: "evidence_rule",
    reason_codes: shadow
      ? [
          "shadow_would_continue_verification",
          "completion_claim_missing_required_evidence",
        ]
      : ["completion_claim_missing_required_evidence"],
    attempt,
    missing_requirement_refs: missing.map((item) => item.ref),
  };
}
