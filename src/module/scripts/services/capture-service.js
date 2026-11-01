// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import {
  CAPTURE_LEVELS,
  DEFAULT_MAX_ENTRIES,
  HOOKS,
  MODULE_ID
} from "../core/constants.js";
import { attributeEvidence, entryMatchesSelection } from "../utils/attribution.js";
import { RingBuffer } from "../utils/ring-buffer.js";
import { toSerializable } from "../utils/serializer.js";

function serializeConsoleArgs(args) {
  const data = toSerializable(args);
  const message = args.map((value, index) => {
    if (typeof value === "string") return value;
    if (value instanceof Error) return `${value.name}: ${value.message}`;
    try {
      return JSON.stringify(Array.isArray(data) ? data[index] : toSerializable(value));
    } catch {
      return String(value);
    }
  }).join(" ");
  return { data, message };
}

function stackFromArgs(args) {
  const error = args.find((value) => value instanceof Error);
  if (error?.stack) return error.stack;
  try {
    const stack = new Error("Captured console call").stack ?? "";
    return stack
      .split("\n")
      .filter((line, index) => index === 0 || (!line.includes("stackFromArgs") && !line.includes("/capture-service.js:")))
      .join("\n");
  } catch {
    return "";
  }
}

export class CaptureService {
  #buffer;
  #originalConsole = new Map();
  #consoleWrappers = new Map();
  #listeners = [];
  #foundryErrorHook = null;
  #performanceObserver = null;
  #sequence = 0;
  #backgroundEnabled = false;
  #focused = null;
  #lastFocusedSession = null;
  #focusedSessionSequence = 0;
  #installed = false;

  constructor({ maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
    this.#buffer = new RingBuffer(maxEntries);
  }

  get state() {
    return {
      installed: this.#installed,
      backgroundEnabled: this.#backgroundEnabled,
      focused: this.#focused ? {
        id: this.#focused.id,
        startedAt: this.#focused.startedAt,
        selectedModuleIds: this.#focused.selectedModuleIds === null ? null : [...this.#focused.selectedModuleIds],
        includeUnknown: this.#focused.includeUnknown,
        levels: [...this.#focused.levels]
      } : null,
      lastFocusedSession: this.#lastFocusedSession ? { ...this.#lastFocusedSession } : null,
      size: this.#buffer.size,
      dropped: this.#buffer.dropped,
      limit: this.#buffer.limit
    };
  }

  setLimit(limit) {
    this.#buffer.limit = limit;
    this.#emitState();
  }

  install({ backgroundEnabled = true, captureLongTasks = true } = {}) {
    if (this.#installed) {
      this.#backgroundEnabled = backgroundEnabled;
      this.setLongTaskCapture(captureLongTasks);
      this.#emitState();
      return;
    }
    this.#installed = true;
    this.#backgroundEnabled = backgroundEnabled;
    // Console methods are wrapped only during an explicit focused capture. Keeping
    // wrappers installed permanently changes browser-console call sites and makes
    // unrelated output appear to originate from this diagnostics module.
    this.#listen(window, "error", (event) => this.#captureWindowError(event), true);
    this.#listen(window, "unhandledrejection", (event) => this.#captureUnhandledRejection(event));
    this.#listen(document, "securitypolicyviolation", (event) => this.#captureCspViolation(event));
    if (globalThis.Hooks?.on) {
      this.#foundryErrorHook = Hooks.on("error", (location, error, data) => {
        this.record({
          channel: "foundry-hook",
          level: "error",
          message: error?.message ?? String(error),
          stack: error?.stack ?? "",
          location,
          data
        });
      });
    }
    this.setLongTaskCapture(captureLongTasks);
    this.#emitState();
  }

  uninstall() {
    if (!this.#installed) return;
    this.#restoreConsoleWrappers();
    for (const { target, type, listener, options } of this.#listeners) target.removeEventListener(type, listener, options);
    this.#listeners = [];
    if (this.#foundryErrorHook !== null && globalThis.Hooks?.off) Hooks.off("error", this.#foundryErrorHook);
    this.#foundryErrorHook = null;
    this.setLongTaskCapture(false);
    this.#installed = false;
    this.#focused = null;
    this.#emitState();
  }

  setBackgroundEnabled(enabled) {
    this.#backgroundEnabled = Boolean(enabled);
    this.#emitState();
  }

  setLongTaskCapture(enabled) {
    this.#performanceObserver?.disconnect();
    this.#performanceObserver = null;
    if (!enabled || typeof PerformanceObserver === "undefined") return;
    try {
      const supported = PerformanceObserver.supportedEntryTypes?.includes("longtask");
      if (!supported) return;
      this.#performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.record({
            channel: "performance",
            level: "warn",
            message: `Long task detected: ${entry.duration.toFixed(1)} ms`,
            data: {
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
              attribution: entry.attribution
            }
          }, { force: true });
        }
      });
      this.#performanceObserver.observe({ type: "longtask", buffered: false });
    } catch (error) {
      this.record({
        channel: "diagnostics",
        level: "debug",
        message: `Long-task observer unavailable: ${error instanceof Error ? error.message : String(error)}`
      }, { force: true });
    }
  }

  startFocused({ selectedModuleIds = null, includeUnknown = true, levels = CAPTURE_LEVELS } = {}) {
    if (this.#focused) this.#finalizeFocusedSession();
    this.#restoreConsoleWrappers();
    this.#focused = {
      id: ++this.#focusedSessionSequence,
      startedAt: new Date().toISOString(),
      selectedModuleIds: selectedModuleIds === null ? null : new Set(selectedModuleIds),
      includeUnknown: Boolean(includeUnknown),
      levels: new Set(levels.filter((level) => CAPTURE_LEVELS.includes(level)))
    };
    this.#installConsoleWrappers();
    this.#emitState();
  }

  stopFocused() {
    if (this.#focused) this.#finalizeFocusedSession();
    this.#restoreConsoleWrappers();
    this.#emitState();
  }

  clear() {
    this.#buffer.clear();
    this.#lastFocusedSession = null;
    this.#emitState();
  }

  entries({ selectedModuleIds = null, includeUnknown = true, levels = CAPTURE_LEVELS, focusedSessionId = null } = {}) {
    const levelSet = new Set(levels);
    return this.#buffer.values().filter((entry) => {
      if (focusedSessionId !== null && entry.focusedSessionId !== focusedSessionId) return false;
      return levelSet.has(entry.level) && entryMatchesSelection(entry, selectedModuleIds, includeUnknown);
    });
  }

  record(input, { force = false } = {}) {
    const level = CAPTURE_LEVELS.includes(input.level) ? input.level : "log";
    if (!force && !this.#shouldAttemptCapture(level)) return null;
    const entry = {
      id: ++this.#sequence,
      timestamp: new Date().toISOString(),
      elapsedMs: Math.round(performance.now()),
      channel: input.channel ?? "console",
      level,
      message: String(input.message ?? ""),
      stack: String(input.stack ?? ""),
      sourceUrl: String(input.sourceUrl ?? ""),
      location: String(input.location ?? ""),
      data: toSerializable(input.data ?? null),
      focusedSessionId: null
    };
    entry.attribution = attributeEvidence(entry);

    const backgroundEligible = this.#backgroundEnabled && ["warn", "error"].includes(level);
    const focusedEligible = this.#focused
      && this.#focused.levels.has(level)
      && entryMatchesSelection(entry, this.#focused.selectedModuleIds, this.#focused.includeUnknown);
    if (!force && !backgroundEligible && !focusedEligible) return null;
    if (focusedEligible) entry.focusedSessionId = this.#focused.id;

    this.#buffer.push(entry);
    globalThis.Hooks?.callAll?.(HOOKS.CAPTURE_ENTRY, entry);
    this.#emitState();
    return entry;
  }

  #installConsoleWrappers() {
    const focusedLevels = this.#focused?.levels ?? new Set();
    for (const level of CAPTURE_LEVELS) {
      if (!focusedLevels.has(level)) continue;
      const original = console[level];
      if (typeof original !== "function") continue;
      const bound = original.bind(console);
      const wrapper = (...args) => {
        bound(...args);
        if (!this.#shouldAttemptCapture(level)) return;
        try {
          const serialized = serializeConsoleArgs(args);
          this.record({
            channel: "console",
            level,
            message: serialized.message,
            stack: stackFromArgs(args),
            data: serialized.data
          });
        } catch (error) {
          bound(`[${MODULE_ID}] Failed to record console entry`, error);
        }
      };
      this.#originalConsole.set(level, original);
      this.#consoleWrappers.set(level, wrapper);
      console[level] = wrapper;
    }
  }

  #restoreConsoleWrappers() {
    for (const [level, original] of this.#originalConsole.entries()) {
      if (console[level] === this.#consoleWrappers.get(level)) console[level] = original;
    }
    this.#originalConsole.clear();
    this.#consoleWrappers.clear();
  }

  #shouldAttemptCapture(level) {
    if (this.#backgroundEnabled && ["warn", "error"].includes(level)) return true;
    return Boolean(this.#focused?.levels.has(level));
  }

  #captureWindowError(event) {
    const error = event.error instanceof Error ? event.error : null;
    const resource = event.target instanceof Element && event.target !== window
      ? event.target
      : null;
    const resourceUrl = resource?.src ?? resource?.href ?? "";
    const resourceLabel = resource
      ? `${resource.tagName.toLowerCase()}${resourceUrl ? ` ${resourceUrl}` : ""}`
      : "";
    this.record({
      channel: resource ? "resource-error" : "window-error",
      level: "error",
      message: error?.message ?? event.message ?? (resource ? `Resource failed to load: ${resourceLabel}` : "Unknown window error"),
      stack: error?.stack ?? "",
      sourceUrl: event.filename ?? resourceUrl,
      location: event.filename ? `${event.filename}:${event.lineno ?? 0}:${event.colno ?? 0}` : "",
      data: resource ? {
        tagName: resource.tagName.toLowerCase(),
        rel: resource.rel ?? null,
        type: resource.type ?? null
      } : null
    });
  }

  #captureUnhandledRejection(event) {
    const reason = event.reason;
    this.record({
      channel: "unhandledrejection",
      level: "error",
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack ?? "" : "",
      data: reason
    });
  }

  #captureCspViolation(event) {
    this.record({
      channel: "csp",
      level: "error",
      message: `Content Security Policy violation: ${event.violatedDirective}`,
      sourceUrl: event.sourceFile ?? event.blockedURI ?? "",
      location: event.sourceFile ? `${event.sourceFile}:${event.lineNumber ?? 0}:${event.columnNumber ?? 0}` : "",
      data: {
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
        originalPolicy: event.originalPolicy,
        disposition: event.disposition
      }
    });
  }

  #listen(target, type, listener, options = false) {
    target.addEventListener(type, listener, options);
    this.#listeners.push({ target, type, listener, options });
  }

  #finalizeFocusedSession() {
    const focused = this.#focused;
    if (!focused) return;
    const sessionEntries = this.#buffer.values().filter((entry) => entry.focusedSessionId === focused.id);
    this.#lastFocusedSession = {
      id: focused.id,
      startedAt: focused.startedAt,
      endedAt: new Date().toISOString(),
      retainedEntries: sessionEntries.length,
      selectedModuleIds: focused.selectedModuleIds === null ? null : [...focused.selectedModuleIds],
      includeUnknown: focused.includeUnknown,
      levels: [...focused.levels]
    };
    this.#focused = null;
  }

  #emitState() {
    globalThis.Hooks?.callAll?.(HOOKS.CAPTURE_STATE, this.state);
  }
}
