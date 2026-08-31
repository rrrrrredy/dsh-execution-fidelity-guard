// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from "node:crypto";

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  }
  return value;
}

export function stableStringify(value) {
  return JSON.stringify(sortValue(value));
}

export function sha256(value) {
  const input = typeof value === "string" || Buffer.isBuffer(value) ? value : stableStringify(value);
  return createHash("sha256").update(input).digest("hex");
}

export function makeId(prefix, parts = []) {
  return prefix + sha256([...parts, Date.now(), randomUUID()]).slice(0, 24);
}

export function redactText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{12,}|github_pat_[A-Za-z0-9_]{12,})\b/g, "[REDACTED_TOKEN]")
    .replace(/\b(password|passwd|token|secret|authorization|api[_-]?key)\b\s*[:=]\s*([^\s,;]+)/gi, "$1=[REDACTED]")
    .slice(0, maxLength);
}

