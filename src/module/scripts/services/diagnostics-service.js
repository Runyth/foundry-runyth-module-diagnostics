// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  HOOKS,
  MAX_ASSET_SCAN_BYTES,
  MAX_ASSET_SCAN_COUNT,
  MAX_SCAN_FINDINGS,
  MAX_SOURCE_CACHE_BYTES,
  MODULE_ID
} from "../core/constants.js";
import { toSerializable } from "../utils/serializer.js";

const SOURCE_HINTS = Object.freeze([
  {
    id: "legacy-application-global",
    severity: "warning",
    pattern: /\b(?:Application|FormApplication)\b/gu,
    message: "Legacy Application/FormApplication reference detected. Review whether ApplicationV2 is required for this Foundry version."
  },
  {
    id: "generic-render-hook",
    severity: "warning",
    pattern: /Hooks\.(?:on|once)\(\s*["']renderApplication/gu,
    message: "Generic renderApplication hook detected. Confirm strict application scoping and idempotent listener installation."
  },
  {
    id: "jquery-find",
    severity: "warning",
    pattern: /\bhtml\.find\s*\(/gu,
    message: "jQuery-style html.find call detected. ApplicationV2 render hooks commonly supply native DOM structures."
  },
  {
    id: "prototype-assignment",
    severity: "error",
    pattern: /\.prototype\.[A-Za-z_$][\w$]*\s*=/gu,
    message: "Prototype assignment detected. Confirm this is necessary, reversible, version-gated, and limited to an owned class."
  },
  {
    id: "global-query-selector",
    severity: "warning",
    pattern: /\bdocument\.(?:querySelector|querySelectorAll|getElementById)\s*\(/gu,
    message: "Global DOM query detected. Confirm selectors are restricted to the module application's owned root."
  },
  {
    id: "global-window-listener",
    severity: "warning",
    pattern: /\b(?:window|document)\.addEventListener\s*\(/gu,
    message: "Global listener detected. Confirm it is installed once and removed during teardown."
  },
  {
    id: "recursive-deep-freeze",
    severity: "error",
    pattern: /function\s+deepFreeze|const\s+deepFreeze|deepFreeze\s*=|deepFreeze\s*\(/gu,
    message: "Custom deepFreeze traversal detected. Live Foundry objects may be cyclic; require cycle guards, depth bounds, and plain-data extraction."
  },
  {
    id: "fixed-overlay",
    severity: "warning",
    pattern: /position\s*:\s*fixed/gu,
    message: "Fixed positioning detected. Confirm the element cannot obstruct unrelated Foundry dialogs, sheets, pop-outs, or controls."
  }
]);

const DOM_SCAN_NODE_LIMIT = 20_000;
const DOM_COMPUTED_STYLE_LIMIT = 5_000;
const ASSET_FETCH_TIMEOUT_MS = 10_000;
const ASSET_SCAN_CONCURRENCY = 6;
const RUN_ALL_WEIGHTS = Object.freeze({
  relationships: 10,
  assets: 45,
  source: 15,
  css: 15,
  dom: 10,
  resources: 5
});

function emitProgress(onProgress, update) {
  if (typeof onProgress !== "function") return;
  try {
    onProgress({
      completed: 0,
      total: 0,
      percent: 0,
      label: "Working…",
      detail: "",
      ...update
    });
  } catch {
    // Progress callbacks are advisory UI hooks and must never break diagnostics.
  }
}

function clampPercent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function listFrom(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  try {
    return [...value];
  } catch {
    return [];
  }
}

function safeRead(object, key, fallback = null) {
  try {
    return object?.[key] ?? fallback;
  } catch {
    return fallback;
  }
}

function plainPackageData(pkg) {
  try {
    if (typeof pkg?.toObject === "function") {
      const value = pkg.toObject();
      if (value && typeof value === "object") return value;
    }
  } catch {
    // Fall back to public initialized fields below.
  }
  return null;
}

function packageField(pkg, key, fallback = null) {
  const source = plainPackageData(pkg);
  if (source && Object.hasOwn(source, key)) return source[key] ?? fallback;
  return safeRead(pkg, key, fallback);
}

function normalizePackageAssetPath(pkg, value) {
  const original = String(value ?? "").trim();
  if (!original) return null;
  if (/^(?:data|blob|javascript):/iu.test(original)) return null;

  // Foundry V13 package instances may expose already-rooted package asset paths
  // (for example modules/example/scripts/main.js), while raw manifest data uses
  // package-relative paths. Accept both forms and never prepend the package root twice.
  const withoutLeadingSlash = original.replace(/^\/+/, "");
  if (/^https?:\/\//iu.test(withoutLeadingSlash)) {
    try {
      const parsed = new URL(withoutLeadingSlash);
      const currentOrigin = globalThis.location?.origin;
      if (currentOrigin && parsed.origin !== currentOrigin) return null;
      return parsed.href;
    } catch {
      return null;
    }
  }
  if (/^(?:modules|systems|worlds)\//iu.test(withoutLeadingSlash)) return withoutLeadingSlash;
  return `modules/${pkg.id}/${withoutLeadingSlash.replace(/^\.\//u, "")}`;
}

function packageAssetCacheKey(pkg, value) {
  const rootedPath = normalizePackageAssetPath(pkg, value);
  return rootedPath ? `${pkg.id}:${rootedPath}` : null;
}

const BROAD_CSS_PATTERNS = Object.freeze([
  { pattern: /(^|\})\s*(button|input|select|textarea|label|form|table|a|img)\s*[\{,]/gmu, message: "Unscoped element selector" },
  { pattern: /(^|\})\s*\.(?:window-content|application|dialog|sheet|sidebar|chat-log)\b/gmu, message: "Broad Foundry UI selector" },
  { pattern: /z-index\s*:\s*(?:[1-9]\d{3,}|999)/gmu, message: "Very high z-index" },
  { pattern: /position\s*:\s*fixed/gmu, message: "Fixed viewport positioning" }
]);

function abortError(reason = "Diagnostics operation aborted.") {
  if (reason instanceof Error) return reason;
  return new DOMException(String(reason), "AbortError");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal.reason);
}

async function fetchWithTimeout(url, options = {}, signal = null) {
  throwIfAborted(signal);
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", forwardAbort, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(new DOMException(
    `Asset request exceeded ${ASSET_FETCH_TIMEOUT_MS} ms.`,
    "TimeoutError"
  )), ASSET_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason) throw abortError(controller.signal.reason);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function mapWithConcurrency(values, concurrency, mapper) {
  const results = new Array(values.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= values.length) return;
      results[index] = await mapper(values[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function readResponseTextBounded(response, maximumBytes, signal = null) {
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maximumBytes) return null;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      throwIfAborted(signal);
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("Diagnostics source-size limit reached.");
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function normalizeAssetList(pkg) {
  const values = [];
  const add = (value, kind) => {
    if (!value) return;
    if (typeof value === "string") values.push({ path: value, kind });
    else if (typeof value === "object") {
      const assetPath = safeRead(value, "path") ?? safeRead(value, "src");
      if (typeof assetPath === "string") values.push({ path: assetPath, kind });
    }
  };
  for (const value of listFrom(packageField(pkg, "esmodules", []))) add(value, "esmodule");
  for (const value of listFrom(packageField(pkg, "scripts", []))) add(value, "script");
  for (const value of listFrom(packageField(pkg, "styles", []))) add(value, "style");
  for (const value of listFrom(packageField(pkg, "languages", []))) add(safeRead(value, "path", value), "language");
  return values;
}

function relationshipData(pkg) {
  const relationships = packageField(pkg, "relationships", {}) ?? {};
  const flatten = (values = [], category) => listFrom(values).map((relationship) => ({
    category,
    id: safeRead(relationship, "id"),
    type: safeRead(relationship, "type") ?? (category === "systems" ? "system" : "module"),
    compatibility: toSerializable(safeRead(relationship, "compatibility", null)),
    reason: safeRead(relationship, "reason", "")
  })).filter((relationship) => Boolean(relationship.id));
  return [
    ...flatten(safeRead(relationships, "requires", []), "requires"),
    ...flatten(safeRead(relationships, "recommends", []), "recommends"),
    ...flatten(safeRead(relationships, "conflicts", []), "conflicts"),
    ...flatten(safeRead(relationships, "systems", []), "systems")
  ];
}

function versionInRange(version, compatibility) {
  if (!version || !compatibility || typeof compatibility !== "object") return true;
  const minimum = safeRead(compatibility, "minimum");
  const maximum = safeRead(compatibility, "maximum");
  const isNewer = globalThis.foundry?.utils?.isNewerVersion;
  if (typeof isNewer !== "function") return true;
  if (minimum && isNewer(minimum, version)) return false;
  if (maximum && isNewer(version, maximum)) return false;
  return true;
}

function compatibilityData(pkg) {
  const compatibility = packageField(pkg, "compatibility", null);
  return {
    // V13 uses the compatibility object. Do not touch the deprecated pre-V10
    // minimumCoreVersion/compatibleCoreVersion shims: malformed third-party
    // package data can make those legacy getters throw while being inspected.
    minimum: safeRead(compatibility, "minimum"),
    verified: safeRead(compatibility, "verified"),
    maximum: safeRead(compatibility, "maximum"),
    incompatible: Boolean(safeRead(pkg, "incompatibleWithCoreVersion", false))
  };
}

function packageSnapshot(pkg, type) {
  return {
    id: safeRead(pkg, "id", "unknown"),
    title: safeRead(pkg, "title", safeRead(pkg, "id", "Unknown package")),
    type,
    version: safeRead(pkg, "version", null),
    active: Boolean(safeRead(pkg, "active", false)),
    compatibility: compatibilityData(pkg),
    relationships: relationshipData(pkg),
    authors: listFrom(packageField(pkg, "authors", [])).map((author) => safeRead(author, "name", String(author))),
    manifest: safeRead(pkg, "manifest"),
    availability: safeRead(pkg, "availability"),
    flags: toSerializable(packageField(pkg, "flags", {}))
  };
}

function expectedMime(kind) {
  if (["esmodule", "script"].includes(kind)) return ["javascript", "ecmascript", "text/plain"];
  if (kind === "style") return ["text/css"];
  if (kind === "language") return ["application/json", "text/json", "text/plain"];
  return [];
}

function countLine(text, index) {
  return text.slice(0, index).split("\n").length;
}

function excerpt(text, index, length = 160) {
  const start = Math.max(0, index - 60);
  return text.slice(start, Math.min(text.length, index + length)).replace(/\s+/gu, " ").trim();
}

export class DiagnosticsService {
  #capture;
  #scanResults = {};
  #sourceCache = new Map();
  #sourceAttempted = new Set();
  #sourceCacheBytes = 0;

  constructor(captureService) {
    this.#capture = captureService;
  }

  get scanResults() {
    return structuredClone(this.#scanResults);
  }

  environmentSnapshot() {
    const modules = [...game.modules.values()].map((pkg) => packageSnapshot(pkg, "module"));
    const systems = game.system ? [packageSnapshot(game.system, "system")] : [];
    return {
      generatedAt: new Date().toISOString(),
      foundry: {
        version: game.version ?? globalThis.CONST?.VERSION ?? "unknown",
        release: toSerializable(game.release ?? null),
        route: globalThis.foundry?.utils?.getRoute ? foundry.utils.getRoute("") : null
      },
      world: {
        id: game.world?.id ?? null,
        system: game.system?.id ?? null,
        systemVersion: game.system?.version ?? null,
        sceneId: globalThis.canvas?.scene?.id ?? null,
        userRole: game.user?.role ?? null,
        isGM: Boolean(game.user?.isGM)
      },
      browser: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        languages: navigator.languages,
        platform: navigator.userAgentData?.platform ?? navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemory: navigator.deviceMemory ?? null,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio
        }
      },
      modules,
      systems
    };
  }

  activeModuleOptions() {
    return [...game.modules.values()]
      .filter((pkg) => Boolean(safeRead(pkg, "active", false)) && safeRead(pkg, "id") !== MODULE_ID)
      .map((pkg) => ({
        id: safeRead(pkg, "id", "unknown"),
        title: safeRead(pkg, "title", safeRead(pkg, "id", "Unknown module")),
        version: safeRead(pkg, "version", null)
      }))
      .sort((left, right) => left.title.localeCompare(right.title));
  }

  async runScan(name, selectedModuleIds = null, options = {}) {
    const signal = options.signal ?? null;
    const onProgress = options.onProgress ?? null;
    throwIfAborted(signal);
    emitProgress(onProgress, { label: `Starting ${name} scan…`, detail: "Preparing scan inputs.", percent: 0 });
    const handlers = {
      relationships: () => this.scanRelationships(selectedModuleIds, { signal, onProgress }),
      assets: () => this.scanAssets(selectedModuleIds, { signal, onProgress }),
      source: () => this.scanSourceHints(selectedModuleIds, { signal, onProgress }),
      css: () => this.scanCssScope(selectedModuleIds, { signal, onProgress }),
      dom: () => this.scanDom({ signal, onProgress }),
      resources: () => this.scanResources(selectedModuleIds, { signal, onProgress })
    };
    const handler = handlers[name];
    if (!handler) throw new Error(`Unknown diagnostics scan: ${name}`);
    const result = await handler();
    throwIfAborted(signal);
    this.#scanResults[name] = result;
    emitProgress(onProgress, { label: `${name} scan complete`, detail: `${result?.summary?.findings ?? result?.findings?.length ?? 0} findings.`, completed: 1, total: 1, percent: 100 });
    globalThis.Hooks?.callAll?.(HOOKS.SCAN_COMPLETE, name, result);
    return structuredClone(result);
  }

  async runAll(selectedModuleIds = null, options = {}) {
    const output = {};
    const names = ["relationships", "assets", "source", "css", "dom", "resources"];
    const totalWeight = Object.values(RUN_ALL_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    let completedWeight = 0;
    for (const [index, name] of names.entries()) {
      throwIfAborted(options.signal);
      const weight = RUN_ALL_WEIGHTS[name];
      output[name] = await this.runScan(name, selectedModuleIds, {
        ...options,
        onProgress: (update) => {
          const localPercent = clampPercent(update.percent);
          const overallPercent = ((completedWeight + (weight * localPercent / 100)) / totalWeight) * 100;
          emitProgress(options.onProgress, {
            ...update,
            label: `${index + 1}/${names.length} · ${update.label}`,
            detail: update.detail || `Running ${name} scan.`,
            stage: name,
            stageIndex: index + 1,
            stageCount: names.length,
            percent: clampPercent(overallPercent)
          });
        }
      });
      completedWeight += weight;
    }
    emitProgress(options.onProgress, { label: "All scans complete", detail: `${names.length} scan stages completed.`, completed: names.length, total: names.length, percent: 100 });
    return output;
  }

  scanRelationships(selectedModuleIds = null, { signal = null, onProgress = null } = {}) {
    const selected = this.#selectedModules(selectedModuleIds);
    const findings = [];
    emitProgress(onProgress, { label: "Checking package relationships…", detail: `${selected.length} selected modules.`, completed: 0, total: selected.length, percent: selected.length === 0 ? 100 : 0 });
    for (const [packageIndex, pkg] of selected.entries()) {
      throwIfAborted(signal);
      const compatibility = compatibilityData(pkg);
      if (compatibility.incompatible) {
        findings.push({
          severity: "error",
          moduleId: pkg.id,
          message: `${pkg.title} reports an incompatible Foundry core version.`,
          data: compatibility
        });
      }
      const relationships = relationshipData(pkg);
      const supportedSystems = relationships.filter((relationship) => relationship.category === "systems");
      if (supportedSystems.length > 0 && !supportedSystems.some((relationship) => relationship.id === game.system?.id)) {
        findings.push({
          severity: "warning",
          moduleId: pkg.id,
          message: `${pkg.title} does not declare the current system '${game.system?.id ?? "unknown"}' among its supported systems.`,
          data: supportedSystems
        });
      }
      for (const relationship of relationships) {
        const dependency = relationship.type === "system"
          ? (game.system?.id === relationship.id ? game.system : null)
          : game.modules.get(relationship.id);
        const installed = Boolean(dependency);
        const active = relationship.type === "system"
          ? installed
          : Boolean(dependency?.active);
        const compatible = installed && versionInRange(dependency.version, relationship.compatibility);

        if (relationship.category === "requires" && (!installed || !active || !compatible)) {
          const state = !installed ? "not installed" : !active ? "inactive" : "outside the declared version range";
          findings.push({
            severity: "error",
            moduleId: pkg.id,
            message: `${pkg.title} requires active ${relationship.type} '${relationship.id}', but it is ${state}.`,
            data: { relationship, installedVersion: dependency?.version ?? null }
          });
        }
        if (relationship.category === "recommends" && installed && active && !compatible) {
          findings.push({
            severity: "warning",
            moduleId: pkg.id,
            message: `${pkg.title} recommends ${relationship.type} '${relationship.id}', but installed version ${dependency.version} is outside the declared range.`,
            data: relationship
          });
        }
        if (relationship.category === "conflicts" && installed && active && compatible) {
          findings.push({
            severity: "warning",
            moduleId: pkg.id,
            message: `${pkg.title} declares a conflict with active ${relationship.type} '${relationship.id}'.`,
            data: { relationship, installedVersion: dependency.version }
          });
        }
        if (relationship.category === "systems" && relationship.id === game.system?.id && !compatible) {
          findings.push({
            severity: "error",
            moduleId: pkg.id,
            message: `${pkg.title} supports system '${relationship.id}', but installed version ${dependency?.version ?? "unknown"} is outside the declared range.`,
            data: relationship
          });
        }
        if (findings.length >= MAX_SCAN_FINDINGS) break;
      }
      emitProgress(onProgress, {
        label: "Checking package relationships…",
        detail: `${pkg.title ?? pkg.id}: ${findings.length} findings so far.`,
        completed: packageIndex + 1,
        total: selected.length,
        percent: selected.length === 0 ? 100 : ((packageIndex + 1) / selected.length) * 100
      });
      if (findings.length >= MAX_SCAN_FINDINGS) break;
    }
    return {
      name: "relationships",
      generatedAt: new Date().toISOString(),
      selectedModuleIds: selected.map((pkg) => pkg.id),
      summary: {
        checked: selected.length,
        findings: findings.length,
        truncated: findings.length >= MAX_SCAN_FINDINGS
      },
      findings
    };
  }

  async scanAssets(selectedModuleIds = null, { signal = null, onProgress = null } = {}) {
    const selected = this.#selectedModules(selectedModuleIds);
    const findings = [];
    const assets = [];
    this.#sourceCache.clear();
    this.#sourceAttempted.clear();
    this.#sourceCacheBytes = 0;
    const candidates = selected.flatMap((pkg) => normalizeAssetList(pkg).map((asset) => ({ pkg, asset })));
    const truncated = candidates.length > MAX_ASSET_SCAN_COUNT;
    const boundedCandidates = candidates.slice(0, MAX_ASSET_SCAN_COUNT);
    let completedCandidates = 0;
    emitProgress(onProgress, {
      label: "Checking manifest assets…",
      detail: `${boundedCandidates.length} declared assets queued${truncated ? ` (bounded from ${candidates.length})` : ""}.`,
      completed: 0,
      total: boundedCandidates.length,
      percent: boundedCandidates.length === 0 ? 100 : 0
    });
    const inspected = await mapWithConcurrency(boundedCandidates, ASSET_SCAN_CONCURRENCY, async ({ pkg, asset }) => {
      throwIfAborted(signal);
      const path = String(asset.path ?? "").replace(/^\/+/, "");
      const relativeUrl = normalizePackageAssetPath(pkg, asset.path);
      const routeable = relativeUrl && !/^https?:\/\//iu.test(relativeUrl);
      const url = routeable && globalThis.foundry?.utils?.getRoute
        ? foundry.utils.getRoute(relativeUrl)
        : relativeUrl;
      const record = { moduleId: pkg.id, path, rootedPath: relativeUrl, kind: asset.kind, url };
      const localFindings = [];
      const cacheKey = packageAssetCacheKey(pkg, asset.path);
      if (cacheKey) this.#sourceAttempted.add(cacheKey);
      if (!relativeUrl) {
        Object.assign(record, { ok: false, skipped: true, error: "Unsupported, cross-origin, or empty asset URL." });
        completedCandidates += 1;
        emitProgress(onProgress, {
          label: "Checking manifest assets…",
          detail: `${pkg.title ?? pkg.id}: skipped unsupported asset path`,
          completed: completedCandidates,
          total: boundedCandidates.length,
          percent: boundedCandidates.length === 0 ? 100 : (completedCandidates / boundedCandidates.length) * 100
        });
        return { record, findings: [{
          severity: "warning",
          moduleId: pkg.id,
          path,
          message: `Skipped unsupported or cross-origin manifest asset path: ${asset.path}`
        }] };
      }
      try {
        const response = await fetchWithTimeout(url, {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store"
        }, signal);
        throwIfAborted(signal);
        const contentType = response.headers.get("content-type") ?? "";
        const contentLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
        Object.assign(record, {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          contentType,
          contentLength: Number.isFinite(contentLength) ? contentLength : null
        });
        if (!response.ok) {
          localFindings.push({
            severity: "error",
            moduleId: pkg.id,
            path,
            message: `Asset request failed with HTTP ${response.status}: ${url}`
          });
        }
        const accepted = expectedMime(asset.kind);
        if (response.ok && accepted.length > 0 && !accepted.some((mime) => contentType.toLowerCase().includes(mime))) {
          localFindings.push({
            severity: "error",
            moduleId: pkg.id,
            path,
            message: `Unexpected Content-Type '${contentType || "missing"}' for ${asset.kind}: ${url}`
          });
        }
        const sourceLike = ["esmodule", "script", "style", "language"].includes(asset.kind);
        if (response.ok && sourceLike && (!Number.isFinite(contentLength) || contentLength <= MAX_ASSET_SCAN_BYTES)) {
          const source = await readResponseTextBounded(response, MAX_ASSET_SCAN_BYTES, signal);
          if (source === null) {
            record.sourceSkipped = `Asset exceeded ${MAX_ASSET_SCAN_BYTES} bytes while streaming.`;
          } else {
            const sourceBytes = new TextEncoder().encode(source).byteLength;
            if (this.#sourceCacheBytes + sourceBytes <= MAX_SOURCE_CACHE_BYTES) {
              if (cacheKey) this.#sourceCache.set(cacheKey, source);
              this.#sourceCacheBytes += sourceBytes;
            } else {
              record.sourceSkipped = `Global source cache limit of ${MAX_SOURCE_CACHE_BYTES} bytes was reached.`;
            }
          }
        } else if (sourceLike && Number.isFinite(contentLength) && contentLength > MAX_ASSET_SCAN_BYTES) {
          record.sourceSkipped = `Content-Length exceeded ${MAX_ASSET_SCAN_BYTES} bytes.`;
        }
      } catch (error) {
        throwIfAborted(signal);
        Object.assign(record, { ok: false, error: error instanceof Error ? error.message : String(error) });
        localFindings.push({
          severity: "error",
          moduleId: pkg.id,
          path,
          message: error?.name === "TimeoutError"
            ? `Asset request timed out after ${ASSET_FETCH_TIMEOUT_MS} ms: ${url}`
            : `Asset request failed: ${url}`,
          data: record.error
        });
      }
      completedCandidates += 1;
      emitProgress(onProgress, {
        label: "Checking manifest assets…",
        detail: `${pkg.title ?? pkg.id}: ${asset.path}`,
        completed: completedCandidates,
        total: boundedCandidates.length,
        percent: boundedCandidates.length === 0 ? 100 : (completedCandidates / boundedCandidates.length) * 100
      });
      return { record, findings: localFindings };
    });
    for (const result of inspected) {
      assets.push(result.record);
      for (const finding of result.findings) {
        if (findings.length >= MAX_SCAN_FINDINGS) break;
        findings.push(finding);
      }
    }
    return {
      name: "assets",
      generatedAt: new Date().toISOString(),
      selectedModuleIds: selected.map((pkg) => pkg.id),
      summary: {
        modules: selected.length,
        declaredAssets: candidates.length,
        checked: assets.length,
        findings: findings.length,
        truncated
      },
      limits: {
        assetCount: MAX_ASSET_SCAN_COUNT,
        perAssetBytes: MAX_ASSET_SCAN_BYTES,
        sourceCacheBytes: MAX_SOURCE_CACHE_BYTES,
        requestTimeoutMs: ASSET_FETCH_TIMEOUT_MS,
        concurrency: ASSET_SCAN_CONCURRENCY
      },
      findings,
      assets
    };
  }

  async scanSourceHints(selectedModuleIds = null, { signal = null, onProgress = null } = {}) {
    emitProgress(onProgress, { label: "Preparing source review…", detail: "Ensuring declared source assets are available.", percent: 0 });
    await this.#ensureSources(selectedModuleIds, {
      signal,
      onProgress: (update) => emitProgress(onProgress, {
        ...update,
        label: "Preparing source review…",
        percent: clampPercent(update.percent * 0.65)
      })
    });
    throwIfAborted(signal);
    const selected = new Set(this.#selectedModules(selectedModuleIds).map((pkg) => pkg.id));
    const findings = [];
    const sources = [...this.#sourceCache.entries()].filter(([key]) => {
      const [moduleId, ...pathParts] = key.split(":");
      return selected.has(moduleId) && /\.(?:m?js|cjs|ts)$/iu.test(pathParts.join(":"));
    });
    emitProgress(onProgress, { label: "Reviewing JavaScript source hints…", detail: `${sources.length} cached source files.`, completed: 0, total: sources.length, percent: 65 });
    for (const [sourceIndex, [key, source]] of sources.entries()) {
      const [moduleId, ...pathParts] = key.split(":");
      const path = pathParts.join(":");
      for (const hint of SOURCE_HINTS) {
        hint.pattern.lastIndex = 0;
        for (const match of source.matchAll(hint.pattern)) {
          findings.push({
            severity: hint.severity,
            moduleId,
            path,
            line: countLine(source, match.index ?? 0),
            ruleId: hint.id,
            message: hint.message,
            excerpt: excerpt(source, match.index ?? 0)
          });
          if (findings.length >= MAX_SCAN_FINDINGS) break;
        }
        if (findings.length >= MAX_SCAN_FINDINGS) break;
      }
      emitProgress(onProgress, {
        label: "Reviewing JavaScript source hints…",
        detail: `${moduleId}: ${path}`,
        completed: sourceIndex + 1,
        total: sources.length,
        percent: 65 + (sources.length === 0 ? 35 : ((sourceIndex + 1) / sources.length) * 35)
      });
      if (findings.length >= MAX_SCAN_FINDINGS) break;
    }
    return {
      name: "source",
      generatedAt: new Date().toISOString(),
      selectedModuleIds: [...selected],
      summary: { cachedAssets: this.#sourceCache.size, findings: findings.length, truncated: findings.length >= MAX_SCAN_FINDINGS },
      disclaimer: "Static text hints identify review targets only. They do not prove that code is reachable, defective, or responsible for an observed issue.",
      findings
    };
  }

  async scanCssScope(selectedModuleIds = null, { signal = null, onProgress = null } = {}) {
    emitProgress(onProgress, { label: "Preparing CSS review…", detail: "Ensuring declared style assets are available.", percent: 0 });
    await this.#ensureSources(selectedModuleIds, {
      signal,
      onProgress: (update) => emitProgress(onProgress, {
        ...update,
        label: "Preparing CSS review…",
        percent: clampPercent(update.percent * 0.65)
      })
    });
    throwIfAborted(signal);
    const selected = new Set(this.#selectedModules(selectedModuleIds).map((pkg) => pkg.id));
    const findings = [];
    const stylesheets = [...this.#sourceCache.entries()].filter(([key]) => {
      const [moduleId, ...pathParts] = key.split(":");
      return selected.has(moduleId) && pathParts.join(":").toLowerCase().endsWith(".css");
    });
    emitProgress(onProgress, { label: "Reviewing CSS scope hints…", detail: `${stylesheets.length} cached stylesheets.`, completed: 0, total: stylesheets.length, percent: 65 });
    for (const [stylesheetIndex, [key, source]] of stylesheets.entries()) {
      const [moduleId, ...pathParts] = key.split(":");
      const path = pathParts.join(":");
      for (const rule of BROAD_CSS_PATTERNS) {
        rule.pattern.lastIndex = 0;
        for (const match of source.matchAll(rule.pattern)) {
          findings.push({
            severity: "warning",
            moduleId,
            path,
            line: countLine(source, match.index ?? 0),
            message: rule.message,
            excerpt: excerpt(source, match.index ?? 0)
          });
          if (findings.length >= MAX_SCAN_FINDINGS) break;
        }
        if (findings.length >= MAX_SCAN_FINDINGS) break;
      }
      emitProgress(onProgress, {
        label: "Reviewing CSS scope hints…",
        detail: `${moduleId}: ${path}`,
        completed: stylesheetIndex + 1,
        total: stylesheets.length,
        percent: 65 + (stylesheets.length === 0 ? 35 : ((stylesheetIndex + 1) / stylesheets.length) * 35)
      });
      if (findings.length >= MAX_SCAN_FINDINGS) break;
    }
    return {
      name: "css",
      generatedAt: new Date().toISOString(),
      selectedModuleIds: [...selected],
      summary: { cachedAssets: this.#sourceCache.size, findings: findings.length, truncated: findings.length >= MAX_SCAN_FINDINGS },
      disclaimer: "CSS findings are conservative heuristics. Review selector context before treating a match as a defect.",
      findings
    };
  }

  async scanDom({ signal = null, onProgress = null } = {}) {
    const ids = new Map();
    const fixedElements = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let visited = 0;
    let computedStyles = 0;
    let element = walker.nextNode();
    emitProgress(onProgress, { label: "Inspecting rendered DOM…", detail: `Bounded to ${DOM_SCAN_NODE_LIMIT.toLocaleString()} elements.`, completed: 0, total: DOM_SCAN_NODE_LIMIT, percent: 0 });
    while (element && visited < DOM_SCAN_NODE_LIMIT) {
      throwIfAborted(signal);
      visited += 1;
      if (element.id) {
        if (!ids.has(element.id)) ids.set(element.id, []);
        ids.get(element.id).push(element);
      }
      if (computedStyles < DOM_COMPUTED_STYLE_LIMIT && fixedElements.length < 250) {
        computedStyles += 1;
        try {
          const style = getComputedStyle(element);
          if (style.position === "fixed") {
            fixedElements.push({
              tag: element.tagName.toLowerCase(),
              id: element.id || null,
              classes: [...element.classList],
              zIndex: style.zIndex,
              applicationId: element.closest(".application")?.id ?? null
            });
          }
        } catch {
          // Ignore nodes whose computed style cannot be read.
        }
      }
      if (visited % 1_000 === 0) {
        emitProgress(onProgress, {
          label: "Inspecting rendered DOM…",
          detail: `${visited.toLocaleString()} elements inspected.`,
          completed: visited,
          total: DOM_SCAN_NODE_LIMIT,
          percent: Math.min(95, (visited / DOM_SCAN_NODE_LIMIT) * 95)
        });
        await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
      }
      element = walker.nextNode();
    }
    const duplicateEntries = [...ids.entries()].filter(([, elements]) => elements.length > 1);
    const duplicates = duplicateEntries
      .slice(0, MAX_SCAN_FINDINGS)
      .map(([id, elements]) => ({
        severity: "warning",
        id,
        count: elements.length,
        elements: elements.slice(0, 10).map((item) => ({
          tag: item.tagName.toLowerCase(),
          classes: [...item.classList],
          applicationId: item.closest(".application")?.id ?? null
        }))
      }));
    emitProgress(onProgress, { label: "Inspecting rendered DOM…", detail: `${visited.toLocaleString()} elements inspected; ${duplicateEntries.length} duplicate IDs.`, completed: visited, total: visited, percent: 100 });
    return {
      name: "dom",
      generatedAt: new Date().toISOString(),
      summary: {
        visitedNodes: visited,
        duplicateIds: duplicateEntries.length,
        reportedDuplicateIds: duplicates.length,
        fixedElements: fixedElements.length,
        findings: duplicates.length,
        truncated: Boolean(element)
      },
      limits: {
        nodeLimit: DOM_SCAN_NODE_LIMIT,
        computedStyleLimit: DOM_COMPUTED_STYLE_LIMIT,
        fixedElementLimit: 250
      },
      findings: duplicates,
      fixedElements
    };
  }

  scanResources(selectedModuleIds = null, { signal = null, onProgress = null } = {}) {
    throwIfAborted(signal);
    const selected = new Set(this.#selectedModules(selectedModuleIds).map((pkg) => pkg.id));
    emitProgress(onProgress, { label: "Reading resource timings…", detail: `${selected.size} selected modules.`, percent: 15 });
    const resources = performance.getEntriesByType("resource")
      .filter((entry) => {
        const match = entry.name.match(/\/modules\/([^/]+)/u);
        if (!match) return false;
        let moduleId = match[1];
        try { moduleId = decodeURIComponent(moduleId); } catch { /* Keep encoded ID. */ }
        return selected.has(moduleId);
      })
      .slice(-5_000)
      .map((entry) => ({
        name: entry.name,
        initiatorType: entry.initiatorType,
        duration: entry.duration,
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
        decodedBodySize: entry.decodedBodySize,
        startTime: entry.startTime,
        responseEnd: entry.responseEnd
      }))
      .sort((left, right) => right.duration - left.duration);
    const slow = resources.filter((entry) => entry.duration >= 250);
    emitProgress(onProgress, { label: "Reading resource timings…", detail: `${resources.length} resources; ${slow.length} slow requests.`, completed: resources.length, total: resources.length, percent: 100 });
    return {
      name: "resources",
      generatedAt: new Date().toISOString(),
      selectedModuleIds: [...selected],
      summary: {
        resources: resources.length,
        slowResources: slow.length,
        transferredBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
        findings: Math.min(slow.length, MAX_SCAN_FINDINGS),
        truncated: resources.length >= 5_000
      },
      findings: slow.slice(0, MAX_SCAN_FINDINGS).map((entry) => ({
        severity: "warning",
        message: `Slow module resource: ${entry.duration.toFixed(1)} ms`,
        data: entry
      })),
      resources
    };
  }

  #selectedModules(selectedModuleIds) {
    const active = [...game.modules.values()].filter((pkg) => Boolean(safeRead(pkg, "active", false)) && safeRead(pkg, "id") !== MODULE_ID);
    if (selectedModuleIds === null || selectedModuleIds === undefined) return active;
    const selected = new Set(selectedModuleIds);
    return active.filter((pkg) => selected.has(safeRead(pkg, "id")));
  }

  async #ensureSources(selectedModuleIds, { signal = null, onProgress = null } = {}) {
    const selected = this.#selectedModules(selectedModuleIds);
    const expected = selected
      .flatMap((pkg) => normalizeAssetList(pkg).map((asset) => packageAssetCacheKey(pkg, asset.path)).filter(Boolean))
      .slice(0, MAX_ASSET_SCAN_COUNT);
    if (expected.some((key) => !this.#sourceAttempted.has(key))) {
      await this.scanAssets(selectedModuleIds, { signal, onProgress });
    } else {
      emitProgress(onProgress, { label: "Declared source cache ready", detail: `${expected.length} asset paths already inspected.`, completed: expected.length, total: expected.length, percent: 100 });
    }
  }
}
