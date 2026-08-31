// SPDX-License-Identifier: Apache-2.0
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { redactText, sha256 } from "./canonical.mjs";

export const CONTRACT_SCHEMA_VERSION = "1.0";
export const REQUIRED_TOP_LEVEL = Object.freeze([
  "objective",
  "primary_object",
  "delivery_surface",
  "scope",
  "must_and_must_not",
  "authorization",
  "completion_evidence",
]);

const ACTION_RULES = new Set([
  "read", "write", "write_workspace", "delete", "destructive",
  "install_local", "network", "publish", "external",
  "external_side_effect", "unknown",
]);
const EVIDENCE_KINDS = new Set([
  "file", "command", "test", "api", "database", "real_page", "release", "user",
]);
const INIT_PLACEHOLDERS = new Set([
  "Replace with the exact user-requested outcome.",
  "Replace with the primary object being changed or delivered.",
  "Replace with non-negotiable requirements.",
]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed, label, errors) {
  if (!isRecord(value)) {
    errors.push(label + " must be an object");
    return;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(label + " has unsupported field: " + key);
  }
}

function stringArray(value, label, errors, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) {
    errors.push(label + " must be an array with at least " + minimum + " item(s)");
    return;
  }
  if (value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    errors.push(label + " must contain only non-empty strings");
  }
  if (new Set(value).size !== value.length) errors.push(label + " must contain unique items");
}

function containsPlaceholder(value) {
  if (typeof value === "string") return INIT_PLACEHOLDERS.has(value.trim());
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (isRecord(value)) return Object.values(value).some(containsPlaceholder);
  return false;
}

function structuredRuleError(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(action|tool|command-prefix):(.*)$/i);
  if (!match) {
    return /^(?:actions?|tools?|command(?:-|_| )?prefix)\s*:/i.test(raw)
      ? "unsupported structured rule syntax: " + raw
      : null;
  }
  const kind = match[1].toLowerCase();
  const ruleValue = match[2].trim().toLowerCase();
  if (!ruleValue) return kind + " rule must have a value";
  if (kind === "action" && !ACTION_RULES.has(ruleValue)) {
    return "unsupported action rule tag: " + ruleValue;
  }
  return null;
}

export function validateTaskContractLite(value) {
  const errors = [];
  exactKeys(value, REQUIRED_TOP_LEVEL, "contract", errors);
  if (!isRecord(value)) return errors;
  for (const key of REQUIRED_TOP_LEVEL) {
    if (!(key in value)) errors.push("contract is missing required field: " + key);
  }
  for (const key of ["objective", "primary_object"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      errors.push(key + " must be a non-empty string");
    }
  }
  stringArray(value.delivery_surface, "delivery_surface", errors, 1);
  exactKeys(value.scope, ["include", "exclude"], "scope", errors);
  if (isRecord(value.scope)) {
    stringArray(value.scope.include, "scope.include", errors);
    stringArray(value.scope.exclude, "scope.exclude", errors);
  }
  exactKeys(value.must_and_must_not, ["must", "must_not"], "must_and_must_not", errors);
  if (isRecord(value.must_and_must_not)) {
    stringArray(value.must_and_must_not.must, "must_and_must_not.must", errors);
    stringArray(value.must_and_must_not.must_not, "must_and_must_not.must_not", errors);
  }
  exactKeys(value.authorization, ["allowed", "requires_user", "forbidden"], "authorization", errors);
  if (isRecord(value.authorization)) {
    for (const key of ["allowed", "requires_user", "forbidden"]) {
      stringArray(value.authorization[key], "authorization." + key, errors);
    }
  }
  for (const rule of [
    ...(value.must_and_must_not?.must_not ?? []),
    ...(value.authorization?.allowed ?? []),
    ...(value.authorization?.requires_user ?? []),
    ...(value.authorization?.forbidden ?? []),
  ]) {
    const error = structuredRuleError(rule);
    if (error) errors.push(error);
  }
  if (!Array.isArray(value.completion_evidence) || value.completion_evidence.length < 1) {
    errors.push("completion_evidence must contain at least one requirement");
  } else {
    for (const [index, item] of value.completion_evidence.entries()) {
      const label = "completion_evidence[" + index + "]";
      exactKeys(item, ["requirement", "acceptable_sources"], label, errors);
      if (!isRecord(item)) continue;
      if (typeof item.requirement !== "string" || !item.requirement.trim()) {
        errors.push(label + ".requirement must be a non-empty string");
      }
      stringArray(item.acceptable_sources, label + ".acceptable_sources", errors, 1);
      if (Array.isArray(item.acceptable_sources) && item.acceptable_sources.some((kind) => !EVIDENCE_KINDS.has(kind))) {
        errors.push(label + ".acceptable_sources contains an unsupported kind");
      }
    }
  }
  if (containsPlaceholder(value)) errors.push("contract contains generated init placeholders");
  return errors;
}

function validateProviderEnvelope(envelope, projection) {
  const errors = [];
  exactKeys(envelope, [
    "schema_version", "contract_ref", "contract_version", "source",
    "source_message_refs", "snapshot_sha256", "updated_at",
  ], "envelope", errors);
  if (!isRecord(envelope)) return errors;
  if (envelope.schema_version !== CONTRACT_SCHEMA_VERSION) errors.push("unsupported schema_version");
  if (typeof envelope.contract_ref !== "string" || !envelope.contract_ref.trim()) errors.push("contract_ref must be non-empty");
  if (!Number.isInteger(envelope.contract_version) || envelope.contract_version < 1) errors.push("contract_version must be a positive integer");
  if (envelope.source !== "user-intent-plugin") errors.push("provider envelope source must be user-intent-plugin");
  stringArray(envelope.source_message_refs, "source_message_refs", errors);
  if (typeof envelope.updated_at !== "string" || !Number.isFinite(Date.parse(envelope.updated_at))) errors.push("updated_at must be an ISO date-time");
  const projectionHash = sha256(projection);
  if (envelope.snapshot_sha256 !== projectionHash) errors.push("snapshot_sha256 does not match the canonical projection");
  return errors;
}

export function parseContractDocument(raw, metadata = {}) {
  if (isRecord(raw) && "envelope" in raw && "projection" in raw) {
    const wrapperErrors = [];
    exactKeys(raw, ["envelope", "projection"], "provider document", wrapperErrors);
    const errors = [
      ...wrapperErrors,
      ...validateProviderEnvelope(raw.envelope, raw.projection),
      ...validateTaskContractLite(raw.projection),
    ];
    if (errors.length) return { status: "invalid", errors };
    return {
      status: "bound",
      envelope: raw.envelope,
      contract: raw.projection,
      provider: "user-intent-plugin",
      snapshotHash: sha256(raw.projection),
    };
  }
  if (isRecord(raw) && ("contract_ref" in raw || "schema_version" in raw)) {
    return { status: "invalid", errors: ["envelopes require a separate bounded projection"] };
  }
  const errors = validateTaskContractLite(raw);
  if (errors.length) return { status: "invalid", errors };
  const snapshotHash = sha256(raw);
  return {
    status: "bound",
    envelope: {
      schema_version: CONTRACT_SCHEMA_VERSION,
      contract_ref: "lite:" + snapshotHash.slice(0, 20),
      contract_version: 1,
      source: "task-contract-lite",
      source_message_refs: [],
      snapshot_sha256: snapshotHash,
      updated_at: metadata.modifiedAt ?? new Date(0).toISOString(),
    },
    contract: raw,
    provider: "task-contract-lite",
    snapshotHash,
  };
}

export function resolveContractPath(agent, configuredPath) {
  const cwd = agent?.session?.header?.cwd || process.cwd();
  return path.isAbsolute(configuredPath) ? configuredPath : path.resolve(cwd, configuredPath);
}

export async function loadContract(contractPath) {
  try {
    const info = await stat(contractPath);
    if (!info.isFile()) return { status: "unbound", path: contractPath, errors: ["not a file"] };
    if (info.size > 256 * 1024) return { status: "invalid", path: contractPath, errors: ["contract exceeds 256 KiB"] };
    const raw = JSON.parse(await readFile(contractPath, "utf8"));
    return { ...parseContractDocument(raw, { modifiedAt: info.mtime.toISOString() }), path: contractPath };
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "unbound", path: contractPath, errors: [] };
    return { status: "invalid", path: contractPath, errors: [redactText(error?.message || "contract load failed", 200)] };
  }
}

