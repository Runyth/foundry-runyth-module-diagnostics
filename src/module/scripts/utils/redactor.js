// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { toSerializable } from "./serializer.js";

const BUILTIN_PATTERNS = Object.freeze([
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/giu, "$1[REDACTED]"],
  [/\b(api[_-]?key|token|secret|password|authorization)(\s*[=:]\s*)[^\s,;"'}]+/giu, "$1$2[REDACTED]"],
  [/([?&](?:token|key|secret|signature|auth)=)[^&#\s]+/giu, "$1[REDACTED]"],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu, "[IP_ADDRESS]"],
  [/\b[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){2,7}\b/giu, "[IP_ADDRESS]"],
  [/\b(?:wss?|https?):\/\/[^\s/]+/giu, (match) => {
    try {
      const url = new URL(match);
      return `${url.protocol}//[HOST]`;
    } catch {
      return "[ORIGIN]";
    }
  }]
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function redactText(value, customTerms = []) {
  let result = String(value ?? "");
  for (const [pattern, replacement] of BUILTIN_PATTERNS) result = result.replace(pattern, replacement);
  for (const term of customTerms.filter((item) => typeof item === "string" && item.trim().length >= 3)) {
    result = result.replace(new RegExp(escapeRegExp(term.trim()), "giu"), "[REDACTED_CUSTOM]");
  }
  return result;
}

export function redactSerializable(value, customTerms = []) {
  const serialized = toSerializable(value);
  const visit = (current) => {
    if (typeof current === "string") return redactText(current, customTerms);
    if (Array.isArray(current)) return current.map(visit);
    if (!current || typeof current !== "object") return current;
    return Object.fromEntries(Object.entries(current).map(([key, item]) => [redactText(key, customTerms), visit(item)]));
  };
  return visit(serialized);
}
