// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import {
  HOOKS,
  MAX_IMPORTED_FILE_BYTES,
  MODULE_ID,
  MODULE_TITLE,
  MODULE_VERSION,
  REPORT_SCHEMA_VERSION
} from "../core/constants.js";
import { KNOWN_ISSUES, matchKnownIssues } from "../core/known-issues.js";
import { createZip } from "../utils/browser-zip.js";
import { downloadBlob } from "../utils/download.js";
import { redactSerializable, redactText } from "../utils/redactor.js";
import { stableStringify } from "../utils/serializer.js";

function filenameTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function markdownValue(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function markdownCodeBlock(...values) {
  const text = values.map((value) => String(value ?? "")).join("\n");
  const longestRun = Math.max(0, ...[...text.matchAll(/`+/gu)].map((match) => match[0].length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return [`${fence}text`, text, fence];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function compatibilityMarkdown(pkg) {
  const compatibility = safeObject(safeObject(pkg).compatibility);
  return `${markdownValue(compatibility.minimum)}–${markdownValue(compatibility.maximum)} (verified ${markdownValue(compatibility.verified)})`;
}

function sanitizeImportedName(name) {
  const sanitized = String(name ?? "evidence.txt").replace(/[^A-Za-z0-9._-]/gu, "_");
  return sanitized || "evidence.txt";
}

function uniqueImportedName(candidate, existingNames) {
  if (!existingNames.has(candidate)) return candidate;
  const dot = candidate.lastIndexOf(".");
  const hasExtension = dot > 0;
  const base = hasExtension ? candidate.slice(0, dot) : candidate;
  const extension = hasExtension ? candidate.slice(dot) : "";
  let suffix = 2;
  while (existingNames.has(`${base}-${suffix}${extension}`)) suffix += 1;
  return `${base}-${suffix}${extension}`;
}

function levelCounts(entries) {
  return entries.reduce((counts, entry) => {
    counts[entry.level] = (counts[entry.level] ?? 0) + 1;
    return counts;
  }, {});
}

function selectedPackages(environment, selectedModuleIds) {
  if (selectedModuleIds === null || selectedModuleIds === undefined) {
    return environment.modules.filter((pkg) => pkg.active && pkg.id !== MODULE_ID);
  }
  const selected = new Set(selectedModuleIds);
  return environment.modules.filter((pkg) => selected.has(pkg.id));
}

function guidanceEvidence(entries, scans, importedFiles) {
  const output = [...entries];
  for (const scan of Object.values(scans)) {
    for (const finding of (scan?.findings ?? []).slice(0, 250)) {
      output.push({
        message: finding.message ?? finding.id ?? "",
        stack: finding.excerpt ?? "",
        location: finding.path ?? ""
      });
    }
  }
  let importedCharacters = 0;
  for (const record of importedFiles) {
    if (importedCharacters >= 2_000_000) break;
    const text = record.text.slice(0, 2_000_000 - importedCharacters);
    importedCharacters += text.length;
    output.push({ message: text, stack: "", location: record.name });
  }
  return output;
}

function issueTrackerMarkdown(report) {
  const safeReport = safeObject(report);
  const environment = safeObject(safeReport.environment);
  const foundryEnvironment = safeObject(environment.foundry);
  const worldEnvironment = safeObject(environment.world);
  const browserEnvironment = safeObject(environment.browser);
  const viewport = safeObject(browserEnvironment.viewport);
  const evidence = safeObject(safeReport.evidence);
  const evidenceEntries = Array.isArray(evidence.entries) ? evidence.entries : [];
  const evidenceLevelCounts = safeObject(evidence.levelCounts);
  const selectedPackageRows = Array.isArray(safeReport.selectedPackages) ? safeReport.selectedPackages : [];
  const knownIssueMatches = Array.isArray(safeReport.knownIssueMatches) ? safeReport.knownIssueMatches : [];
  const scans = safeObject(safeReport.scans);
  const userInput = safeObject(safeReport.userInput);
  const producer = safeObject(safeReport.producer);

  const lines = [
    `# ${MODULE_TITLE} evidence report`,
    "",
    `Generated: ${safeReport.generatedAt ?? "—"}`,
    `Report schema: ${safeReport.schemaVersion ?? "—"}`,
    `Diagnostics module: ${producer.id ?? "—"} ${producer.version ?? "—"}`,
    "",
    "> Attribution and static findings are diagnostic leads, not proof of root cause. Review the original stack, reproduction steps, and package source before assigning responsibility.",
    "",
    "## Reproduction",
    "",
    userInput.summary || "_Describe the observed problem._",
    "",
    "### Steps",
    "",
    userInput.steps || "1. _Describe the exact action that triggers the issue._",
    "",
    `Expected: ${userInput.expected || "_Describe the expected result._"}`,
    "",
    `Actual: ${userInput.actual || "_Describe the actual result._"}`,
    "",
    "## Environment",
    "",
    "| Component | Version / value |",
    "|---|---|",
    `| Foundry VTT | ${markdownValue(foundryEnvironment.version)} |`,
    `| Game system | ${markdownValue(worldEnvironment.system)} ${markdownValue(worldEnvironment.systemVersion)} |`,
    `| Browser | ${markdownValue(browserEnvironment.userAgent)} |`,
    `| Viewport | ${markdownValue(viewport.width)} × ${markdownValue(viewport.height)} @ ${markdownValue(viewport.devicePixelRatio)}× |`,
    "",
    "### Selected modules",
    "",
    "| Module | ID | Version | Core range |",
    "|---|---|---:|---|",
    ...selectedPackageRows.map((pkg) => `| ${markdownValue(safeObject(pkg).title)} | \`${markdownValue(safeObject(pkg).id)}\` | ${markdownValue(safeObject(pkg).version)} | ${compatibilityMarkdown(pkg)} |`),
    "",
    "## Evidence summary",
    "",
    `Captured entries: **${evidenceEntries.length}**; discarded by ring buffer: **${markdownValue(evidence.dropped)}**.`,
    "",
    "| Level | Count |",
    "|---|---:|",
    ...Object.entries(evidenceLevelCounts).sort().map(([level, count]) => `| ${markdownValue(level)} | ${count} |`),
    "",
    "### Most relevant entries",
    ""
  ];

  const relevant = evidenceEntries
    .map((entry) => safeObject(entry))
    .filter((entry) => ["error", "warn"].includes(entry.level))
    .slice(-30)
    .reverse();
  if (relevant.length === 0) lines.push("No warning or error entries were captured.", "");
  for (const entry of relevant) {
    const packageId = entry.attribution?.primaryModuleId ?? entry.attribution?.primarySystemId ?? "unattributed";
    lines.push(
      `#### ${markdownValue(entry.timestamp)} — ${String(entry.level ?? "log").toUpperCase()} — ${markdownValue(packageId)}`,
      "",
      ...markdownCodeBlock(
        entry.message || "(no message)",
        entry.stack || entry.location || "(no stack or location)"
      ),
      ""
    );
  }

  lines.push("## Matched guidance", "");
  if (knownIssueMatches.length === 0) lines.push("No built-in guidance pattern matched the captured evidence.", "");
  for (const issueValue of knownIssueMatches) {
    const issue = safeObject(issueValue);
    const checks = Array.isArray(issue.checks) ? issue.checks : [];
    lines.push(`### ${markdownValue(issue.title)}`, "", markdownValue(issue.summary), "", ...checks.map((check) => `- ${markdownValue(check)}`), "");
  }

  lines.push(
    "## Scan summary",
    "",
    "| Scan | Findings |",
    "|---|---:|",
    ...Object.entries(scans).map(([name, scan]) => `| ${markdownValue(name)} | ${scan?.summary?.findings ?? scan?.findings?.length ?? 0} |`),
    "",
    "## Attachments in this ZIP",
    "",
    "- `report.json`: complete structured and redacted report.",
    "- `evidence.jsonl`: one redacted captured event per line.",
    "- `scans/*.json`: individual diagnostic scan results.",
    "- `imported/*`: explicitly imported client/server log excerpts, if any.",
    "- `known-issues.md`: complete bundled troubleshooting reference.",
    "",
    "## Reporter checklist",
    "",
    "- [ ] Reproduced with the smallest practical module set.",
    "- [ ] Started focused capture immediately before reproduction.",
    "- [ ] Reviewed every attachment for private information before uploading.",
    "- [ ] Included exact steps, expected behavior, and actual behavior.",
    "- [ ] Confirmed whether the problem persists after a Foundry refresh.",
    ""
  );
  return lines.join("\n");
}

function knownIssuesMarkdown() {
  return [
    "# Known issue guidance",
    "",
    "These entries are troubleshooting leads. A pattern match does not identify the responsible package by itself.",
    "",
    ...KNOWN_ISSUES.flatMap((issue) => [
      `## ${issue.title}`,
      "",
      `Severity: ${issue.severity}`,
      "",
      issue.summary,
      "",
      ...issue.checks.map((check) => `- ${check}`),
      ""
    ])
  ].join("\n");
}

export class ReportService {
  #capture;
  #diagnostics;
  #importedFiles = new Map();

  constructor(captureService, diagnosticsService) {
    this.#capture = captureService;
    this.#diagnostics = diagnosticsService;
  }

  get importedFiles() {
    return [...this.#importedFiles.values()].map(({ name, size, type, importedAt }) => ({ name, size, type, importedAt }));
  }

  async importFile(file) {
    if (!(file instanceof File)) throw new TypeError("Expected a File instance.");
    if (file.size > MAX_IMPORTED_FILE_BYTES) {
      throw new RangeError(`Imported files may not exceed ${MAX_IMPORTED_FILE_BYTES} bytes.`);
    }
    const text = await file.text();
    const name = uniqueImportedName(sanitizeImportedName(file.name), this.#importedFiles);
    const record = {
      name,
      size: file.size,
      type: file.type || "text/plain",
      importedAt: new Date().toISOString(),
      text
    };
    this.#importedFiles.set(record.name, record);
    return { ...record, text: undefined };
  }

  removeImportedFile(name) {
    this.#importedFiles.delete(name);
  }

  clearImportedFiles() {
    this.#importedFiles.clear();
  }

  buildReport(options = {}) {
    const selectedModuleIds = options.selectedModuleIds ?? null;
    const includeUnknown = options.includeUnknown ?? true;
    const levels = options.levels;
    const focusedSessionId = options.focusedSessionId ?? null;
    const includeAllPackages = options.includeAllPackages ?? false;
    const customTerms = (options.customRedactions ?? [])
      .map((term) => term.trim())
      .filter(Boolean);
    const fullEnvironment = this.#diagnostics.environmentSnapshot();
    const chosenPackages = selectedPackages(fullEnvironment, selectedModuleIds);
    const rawEnvironment = {
      ...fullEnvironment,
      modules: structuredClone(includeAllPackages ? fullEnvironment.modules : chosenPackages)
    };
    const rawEntries = this.#capture.entries({ selectedModuleIds, includeUnknown, levels, focusedSessionId });
    const rawReport = {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      producer: {
        id: MODULE_ID,
        title: MODULE_TITLE,
        version: MODULE_VERSION
      },
      limitations: [
        "Only browser evidence produced after capture installation is available; prior console history cannot be recovered.",
        "Foundry server logs are not available to browser modules and must be imported explicitly.",
        "Source-path attribution and static scans are best-effort leads, not proof of root cause.",
        "Cross-origin, dynamically generated, or assets larger than the scan limit may not be inspected."
      ],
      userInput: {
        summary: options.summary ?? "",
        steps: options.steps ?? "",
        expected: options.expected ?? "",
        actual: options.actual ?? ""
      },
      environment: rawEnvironment,
      packageInventory: includeAllPackages ? "complete-installed-inventory" : "selected-active-modules",
      selectedPackages: structuredClone(chosenPackages),
      captureState: this.#capture.state,
      evidence: {
        focusedSessionId,
        entries: rawEntries,
        dropped: this.#capture.state.dropped,
        levelCounts: levelCounts(rawEntries)
      },
      knownIssueMatches: matchKnownIssues(guidanceEvidence(rawEntries, this.#diagnostics.scanResults, this.#importedFiles.values())),
      scans: this.#diagnostics.scanResults,
      importedFiles: [...this.#importedFiles.values()].map((record) => ({
        name: record.name,
        size: record.size,
        type: record.type,
        importedAt: record.importedAt
      }))
    };
    return redactSerializable(rawReport, customTerms);
  }

  exportZip(options = {}) {
    const customTerms = (options.customRedactions ?? []).map((term) => term.trim()).filter(Boolean);
    const report = this.buildReport(options);
    const files = {
      "issue-report.md": issueTrackerMarkdown(report),
      "report.json": stableStringify(report),
      "evidence.jsonl": report.evidence.entries.map((entry) => stableStringify(entry, 0)).join("\n"),
      "known-issues.md": knownIssuesMarkdown(),
      "README.txt": [
        `${MODULE_TITLE} ${MODULE_VERSION}`,
        "",
        "Review all files for private information before uploading this report to a third-party issue tracker.",
        "Attribution and static scan findings are diagnostic leads and do not prove package responsibility.",
        "Browser console history from before capture began and Foundry server logs are not automatically available."
      ].join("\n")
    };
    for (const [name, scan] of Object.entries(report.scans)) {
      files[`scans/${name}.json`] = stableStringify(scan);
    }
    for (const record of this.#importedFiles.values()) {
      files[`imported/${record.name}`] = redactText(record.text, customTerms);
    }
    const blob = createZip(files);
    const filename = `${MODULE_ID}-${filenameTimestamp()}.zip`;
    downloadBlob(blob, filename);
    globalThis.Hooks?.callAll?.(HOOKS.REPORT_CREATED, report, filename);
    return { report, filename, size: blob.size };
  }
}
