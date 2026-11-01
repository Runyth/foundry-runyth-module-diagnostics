// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
const PACKAGE_URL_PATTERN = /\/(modules|systems)\/([^/\s?#)]+)/giu;

function evidenceText(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function decodePackageId(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function extractPackageReferences(...values) {
  const references = [];
  const seen = new Set();
  for (const value of values) {
    if (!value) continue;
    const text = evidenceText(value);
    PACKAGE_URL_PATTERN.lastIndex = 0;
    for (const match of text.matchAll(PACKAGE_URL_PATTERN)) {
      const packageType = match[1].toLowerCase() === "modules" ? "module" : "system";
      const id = decodePackageId(match[2]);
      const key = `${packageType}:${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      references.push({ packageType, id });
    }
  }
  return references;
}

export function attributeEvidence({ sourceUrl = "", stack = "", message = "", location = "" } = {}) {
  const references = extractPackageReferences(sourceUrl, stack, location, message);
  const primary = references[0] ?? null;
  return {
    confidence: primary ? (sourceUrl.includes(`/${primary.packageType}s/${primary.id}/`) ? "high" : "medium") : "unknown",
    primaryModuleId: primary?.packageType === "module" ? primary.id : null,
    primarySystemId: primary?.packageType === "system" ? primary.id : null,
    references,
    note: primary
      ? "Best-effort attribution from source URLs or stack text; this does not prove root cause."
      : "No package path was present in the available source or stack text."
  };
}

export function entryMatchesSelection(entry, selectedModuleIds, includeUnknown = true) {
  if (selectedModuleIds === null || selectedModuleIds === undefined) return true;
  const selected = selectedModuleIds instanceof Set ? selectedModuleIds : new Set(selectedModuleIds);
  const references = entry.attribution?.references ?? [];
  const matching = references.some((reference) => reference.packageType === "module" && selected.has(reference.id));
  if (matching) return true;
  const hasModuleReference = references.some((reference) => reference.packageType === "module");
  return includeUnknown && !hasModuleReference;
}
