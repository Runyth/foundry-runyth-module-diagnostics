// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import { KNOWN_ISSUES } from "../core/known-issues.js";
import { getAllowedUserIds, sanitizeAllowedUserIds, selectablePlayerUsers, setAllowedUserIds } from "../core/access-control.js";
import { CAPTURE_LEVELS, HOOKS, MODULE_ID } from "../core/constants.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SCAN_CARDS = Object.freeze([
  { action: "relationships", title: "Package relationships", description: "Checks declared compatibility, required packages, and active conflicts." },
  { action: "assets", title: "Manifest assets", description: "Requests declared scripts, styles, and language files to detect missing files and MIME mismatches." },
  { action: "source", title: "Source review hints", description: "Scans small declared scripts for risky compatibility and interference patterns." },
  { action: "css", title: "CSS scope hints", description: "Flags broad selectors, fixed positioning, and unusually high z-index values." },
  { action: "dom", title: "Rendered DOM", description: "Finds duplicate IDs and inventories fixed-position elements currently in the page." },
  { action: "resources", title: "Resource timing", description: "Summarizes loaded module resources and highlights requests taking at least 250 ms." }
]);

const BUSY_LABELS = Object.freeze({
  "run-all-scans": "Running all scans…",
  "import-evidence": "Importing evidence…",
  "export-report": "Building report ZIP…",
  relationships: "Checking package relationships…",
  assets: "Checking manifest assets…",
  source: "Scanning source hints…",
  css: "Scanning CSS scope…",
  dom: "Inspecting rendered DOM…",
  resources: "Reading resource timings…"
});

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

function savedPosition() {
  const stored = game.settings.get(MODULE_ID, "windowState") ?? {};
  return Object.fromEntries(
    ["top", "left", "width", "height"]
      .filter((key) => Number.isFinite(stored[key]))
      .map((key) => [key, stored[key]])
  );
}

export class DiagnosticsApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static instance = null;

  static DEFAULT_OPTIONS = {
    id: "runyth-module-diagnostics",
    classes: ["runyth-module-diagnostics-app"],
    tag: "section",
    window: {
      title: "Runyth Module Diagnostics",
      icon: "fa-solid fa-stethoscope",
      resizable: true,
      minimizable: true
    },
    position: {
      width: 1_080,
      height: 760
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/diagnostics.hbs`
    }
  };

  #capture;
  #diagnostics;
  #reports;
  #abortController = null;
  #hookIds = [];
  #renderTimer = null;
  #positionSaveTimer = null;
  #operationController = null;
  #busyAction = null;
  #scanProgress = null;
  #lastScanProgress = null;
  #closing = false;
  #activeTab = "capture";
  #moduleSearch = "";
  #accessSearch = "";
  #selectedModuleIds = new Set();
  #pendingAllowedUserIds = new Set();
  #reportInput = {
    summary: "",
    steps: "",
    expected: "",
    actual: "",
    customRedactions: ""
  };
  #initializedSelection = false;
  #initializedAccessSelection = false;
  #includeUnknownEntries = true;
  #reportLevels = new Set(CAPTURE_LEVELS);
  #limitToFocusedSession = true;
  #includeAllPackages = false;

  constructor(captureService, diagnosticsService, reportService, options = {}) {
    super({
      ...options,
      position: {
        ...savedPosition(),
        ...(options.position ?? {})
      }
    });
    this.#capture = captureService;
    this.#diagnostics = diagnosticsService;
    this.#reports = reportService;
    DiagnosticsApp.instance = this;
  }

  async _prepareContext(options) {
    const isGM = Boolean(game.user?.isGM);
    if (!isGM && this.#activeTab === "access") this.#activeTab = "capture";
    if (isGM && !this.#initializedAccessSelection) {
      this.#pendingAllowedUserIds = new Set(sanitizeAllowedUserIds(getAllowedUserIds()));
      this.#initializedAccessSelection = true;
    }
    if (!this.#initializedSelection) {
      this.#selectedModuleIds = new Set(this.#diagnostics.activeModuleOptions().map((module) => module.id));
      this.#initializedSelection = true;
    }
    const modules = this.#diagnostics.activeModuleOptions()
      .map((module) => ({
        ...module,
        checked: this.#selectedModuleIds.has(module.id),
        visible: !this.#moduleSearch || `${module.title} ${module.id}`.toLowerCase().includes(this.#moduleSearch.toLowerCase())
      }));
    const accessUsers = isGM ? selectablePlayerUsers().map((user) => ({
      ...user,
      checked: this.#pendingAllowedUserIds.has(user.id),
      visible: !this.#accessSearch || `${user.name} ${user.id}`.toLowerCase().includes(this.#accessSearch.toLowerCase())
    })) : [];
    const captureState = this.#capture.state;
    const rawFocusedSession = captureState.focused ?? captureState.lastFocusedSession;
    const latestFocusedSession = rawFocusedSession ? {
      ...rawFocusedSession,
      retainedEntries: this.#capture.entries({ focusedSessionId: rawFocusedSession.id }).length
    } : null;
    const entries = this.#capture.entries().slice(-200).reverse().map((entry) => ({
      ...entry,
      packageLabel: entry.attribution?.primaryModuleId ?? entry.attribution?.primarySystemId ?? "Unattributed",
      hasStack: Boolean(entry.stack || entry.location),
      levelClass: `rmd-level-${entry.level}`
    }));
    const scans = this.#diagnostics.scanResults;
    const busy = Boolean(this.#busyAction);
    const scanBusy = Boolean(this.#scanProgress);
    const hasSelection = this.#selectedModuleIds.size > 0;
    return {
      activeTab: this.#activeTab,
      isCaptureTab: this.#activeTab === "capture",
      isScansTab: this.#activeTab === "scans",
      isGuidanceTab: this.#activeTab === "guidance",
      isReportTab: this.#activeTab === "report",
      isAccessTab: this.#activeTab === "access",
      isGM,
      isAuthorizedPlayer: !isGM,
      modules,
      moduleSearch: this.#moduleSearch,
      accessSearch: this.#accessSearch,
      accessUsers,
      hasAccessUsers: accessUsers.length > 0,
      accessSelectedCount: this.#pendingAllowedUserIds.size,
      selectedCount: this.#selectedModuleIds.size,
      hasSelection,
      busy,
      busyLabel: BUSY_LABELS[this.#busyAction] ?? "Working…",
      showBusyBanner: busy && !scanBusy,
      scanBusy,
      hasPreviousScanProgress: Boolean(this.#lastScanProgress),
      scanProgress: this.#scanProgress ?? this.#lastScanProgress ?? {
        label: "Ready to scan",
        detail: "Choose selected modules and run one scan or the complete suite.",
        percent: 0,
        completed: 0,
        total: 0
      },
      captureState,
      focusedActive: Boolean(captureState.focused),
      latestFocusedSession,
      hasFocusedSession: Boolean(latestFocusedSession),
      limitToFocusedSession: this.#limitToFocusedSession,
      includeAllPackages: this.#includeAllPackages,
      captureEntries: entries,
      hasEntries: entries.length > 0,
      levels: CAPTURE_LEVELS.map((level) => ({ level, checked: this.#reportLevels.has(level) })),
      includeUnknownEntries: this.#includeUnknownEntries,
      scanCards: SCAN_CARDS.map((card) => {
        const result = scans[card.action];
        const previewFindings = (result?.findings ?? []).slice(0, 8).map((finding) => ({
          severity: finding.severity ?? "info",
          moduleId: finding.moduleId ?? "",
          message: finding.message ?? (finding.id ? `Duplicate DOM id: ${finding.id} (${finding.count})` : "Review structured report details.")
        }));
        return {
          ...card,
          hasResult: Boolean(result),
          findingCount: result?.summary?.findings ?? result?.findings?.length ?? 0,
          checkedCount: result?.summary?.checked ?? result?.summary?.resources ?? null,
          truncated: Boolean(result?.summary?.truncated),
          previewFindings,
          hasPreviewFindings: previewFindings.length > 0,
          disabled: busy || !hasSelection
        };
      }),
      knownIssues: KNOWN_ISSUES,
      importedFiles: this.#reports.importedFiles.map((file) => ({ ...file, formattedSize: formatBytes(file.size) })),
      hasImportedFiles: this.#reports.importedFiles.length > 0,
      reportInput: this.#reportInput,
      limitations: [
        "Browser console history from before capture began cannot be recovered.",
        "Foundry server logs must be imported manually because browser modules cannot read the server filesystem.",
        "Attribution and static scans identify leads, not definitive root causes.",
        "Only declared, same-origin, reasonably sized text assets are inspected. Fetched source is never included in exported reports."
      ]
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.#abortController?.abort();
    this.#abortController = new AbortController();
    const signal = this.#abortController.signal;
    const root = this.element;
    root.addEventListener("click", (event) => void this.#onClick(event), { signal });
    root.addEventListener("change", (event) => void this.#onChange(event), { signal });
    root.addEventListener("input", (event) => this.#onInput(event), { signal });
    this.#installHooks();
  }

  _onPosition(position) {
    super._onPosition(position);
    this.#scheduleWindowStateSave(position);
  }

  async _preClose(options) {
    this.#closing = true;
    this.#operationController?.abort(new DOMException("Diagnostics dashboard closed.", "AbortError"));
    this.#operationController = null;
    this.#abortController?.abort();
    this.#abortController = null;
    this.#removeHooks();
    if (this.#renderTimer) window.clearTimeout(this.#renderTimer);
    if (this.#positionSaveTimer) window.clearTimeout(this.#positionSaveTimer);
    this.#renderTimer = null;
    this.#positionSaveTimer = null;
    void this.#persistWindowState(this.position);
    await super._preClose(options);
  }

  _onClose(options) {
    super._onClose(options);
    DiagnosticsApp.instance = null;
  }

  async #onClick(event) {
    const origin = event.target;
    if (!(origin instanceof Element)) return;
    const target = origin.closest("[data-rmd-action]");
    if (!target || !this.element.contains(target) || target.disabled) return;
    event.preventDefault();
    const action = target.dataset.rmdAction;
    try {
      switch (action) {
        case "switch-tab": {
          const nextTab = target.dataset.tab;
          if (nextTab === "access" && !game.user?.isGM) break;
          this.#activeTab = nextTab;
          await this.#rerenderIfOpen();
          break;
        }
        case "select-all":
          this.#selectedModuleIds = new Set(this.#diagnostics.activeModuleOptions().map((module) => module.id));
          await this.#rerenderIfOpen();
          break;
        case "select-none":
          this.#selectedModuleIds.clear();
          await this.#rerenderIfOpen();
          break;
        case "access-select-all":
          if (!game.user?.isGM) break;
          this.#pendingAllowedUserIds = new Set(selectablePlayerUsers().map((user) => user.id));
          await this.#rerenderIfOpen();
          break;
        case "access-select-none":
          if (!game.user?.isGM) break;
          this.#pendingAllowedUserIds.clear();
          await this.#rerenderIfOpen();
          break;
        case "save-player-access": {
          if (!game.user?.isGM) {
            ui.notifications.warn(game.i18n.localize("RMD.Notifications.GmOnlyAccess"));
            break;
          }
          const savedIds = await setAllowedUserIds([...this.#pendingAllowedUserIds]);
          this.#pendingAllowedUserIds = new Set(savedIds);
          ui.notifications.info(game.i18n.format("RMD.Notifications.AccessSaved", { count: savedIds.length }));
          await this.#rerenderIfOpen();
          break;
        }
        case "start-selected":
          if (this.#selectedModuleIds.size === 0) {
            ui.notifications.warn(game.i18n.localize("RMD.Notifications.SelectModuleFirst"));
            break;
          }
          this.#capture.startFocused({ selectedModuleIds: [...this.#selectedModuleIds], includeUnknown: this.#includeUnknownEntries });
          ui.notifications.info(game.i18n.localize("RMD.Notifications.CaptureStarted"));
          await this.#rerenderIfOpen();
          break;
        case "start-all":
          this.#capture.startFocused({ selectedModuleIds: null, includeUnknown: true });
          ui.notifications.info(game.i18n.localize("RMD.Notifications.CaptureStarted"));
          await this.#rerenderIfOpen();
          break;
        case "stop-capture":
          this.#capture.stopFocused();
          ui.notifications.info(game.i18n.localize("RMD.Notifications.CaptureStopped"));
          await this.#rerenderIfOpen();
          break;
        case "clear-capture":
          this.#capture.clear();
          ui.notifications.info(game.i18n.localize("RMD.Notifications.CaptureCleared"));
          await this.#rerenderIfOpen();
          break;
        case "run-scan": {
          const name = target.dataset.scan;
          if (!name || this.#selectedModuleIds.size === 0) break;
          await this.#runOperation(name, (signal) => this.#diagnostics.runScan(
            name,
            [...this.#selectedModuleIds],
            { signal, onProgress: (update) => this.#updateScanProgress(update) }
          ), { scan: true });
          break;
        }
        case "run-all-scans": {
          if (this.#selectedModuleIds.size === 0) break;
          await this.#runOperation("run-all-scans", (signal) => this.#diagnostics.runAll(
            [...this.#selectedModuleIds],
            { signal, onProgress: (update) => this.#updateScanProgress(update) }
          ), { scan: true });
          break;
        }
        case "choose-import":
          this.element.querySelector("#rmd-import-file")?.click();
          break;
        case "remove-import":
          this.#reports.removeImportedFile(target.dataset.filename);
          await this.#rerenderIfOpen();
          break;
        case "clear-imports":
          this.#reports.clearImportedFiles();
          await this.#rerenderIfOpen();
          break;
        case "export-report": {
          const reportOptions = this.#reportOptions();
          let result = null;
          const completed = await this.#runOperation("export-report", async (signal) => {
            await new Promise((resolve) => window.setTimeout(resolve, 0));
            if (signal.aborted) throw signal.reason ?? new DOMException("Report export cancelled.", "AbortError");
            result = this.#reports.exportZip(reportOptions);
          });
          if (completed && result) {
            ui.notifications.info(game.i18n.format("RMD.Notifications.ReportExported", { filename: result.filename }));
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      if (isAbortError(error)) return;
      this.#capture.record({
        channel: "diagnostics",
        level: "error",
        message: `Diagnostics action '${action}' failed: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : ""
      }, { force: true });
      ui.notifications.error(error instanceof Error ? error.message : String(error));
    }
  }

  async #onChange(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.matches('input[name="selectedModules"]')) {
      if (target.checked) this.#selectedModuleIds.add(target.value);
      else this.#selectedModuleIds.delete(target.value);
      const count = this.element.querySelector("[data-rmd-selected-count]");
      if (count) count.textContent = String(this.#selectedModuleIds.size);
      const hasSelection = this.#selectedModuleIds.size > 0;
      for (const button of this.element.querySelectorAll('[data-rmd-action="start-selected"], [data-rmd-action="run-scan"], [data-rmd-action="run-all-scans"]')) {
        button.disabled = !hasSelection || Boolean(this.#busyAction);
      }
      return;
    }
    if (target.matches('input[name="allowedUsers"]')) {
      if (!game.user?.isGM) return;
      if (target.checked) this.#pendingAllowedUserIds.add(target.value);
      else this.#pendingAllowedUserIds.delete(target.value);
      const count = this.element.querySelector("[data-rmd-access-selected-count]");
      if (count) count.textContent = String(this.#pendingAllowedUserIds.size);
      return;
    }
    if (target.name === "includeUnknown") {
      this.#includeUnknownEntries = target.checked;
      return;
    }
    if (target.name === "includeAllPackages") {
      this.#includeAllPackages = target.checked;
      return;
    }
    if (target.name === "limitToFocusedSession") {
      this.#limitToFocusedSession = target.checked;
      return;
    }
    if (target.name === "reportLevels") {
      if (target.checked) this.#reportLevels.add(target.value);
      else this.#reportLevels.delete(target.value);
      return;
    }
    if (target.id === "rmd-import-file" && target.files?.[0]) {
      try {
        const file = target.files[0];
        target.value = "";
        await this.#runOperation("import-evidence", () => this.#reports.importFile(file));
      } catch (error) {
        const message = error instanceof RangeError
          ? game.i18n.localize("RMD.Notifications.ImportTooLarge")
          : game.i18n.localize("RMD.Notifications.ImportFailed");
        ui.notifications.error(message);
      }
    }
  }

  #onInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
    if (target.name === "moduleSearch") {
      this.#moduleSearch = target.value;
      for (const item of this.element.querySelectorAll("[data-module-filter-text]")) {
        item.hidden = !item.dataset.moduleFilterText.toLowerCase().includes(this.#moduleSearch.toLowerCase());
      }
      return;
    }
    if (target.name === "accessSearch") {
      this.#accessSearch = target.value;
      for (const item of this.element.querySelectorAll("[data-user-filter-text]")) {
        item.hidden = !item.dataset.userFilterText.toLowerCase().includes(this.#accessSearch.toLowerCase());
      }
      return;
    }
    if (Object.hasOwn(this.#reportInput, target.name)) this.#reportInput[target.name] = target.value;
  }

  #reportOptions() {
    return {
      selectedModuleIds: [...this.#selectedModuleIds],
      includeUnknown: this.#includeUnknownEntries,
      levels: [...this.#reportLevels],
      includeAllPackages: this.#includeAllPackages,
      focusedSessionId: this.#limitToFocusedSession
        ? (this.#capture.state.focused?.id ?? this.#capture.state.lastFocusedSession?.id ?? null)
        : null,
      summary: this.#reportInput.summary,
      steps: this.#reportInput.steps,
      expected: this.#reportInput.expected,
      actual: this.#reportInput.actual,
      customRedactions: this.#reportInput.customRedactions.split(/\r?\n/u)
    };
  }

  async #runOperation(action, operation, { scan = false } = {}) {
    if (this.#operationController || this.#closing) return false;
    const controller = new AbortController();
    this.#operationController = controller;
    this.#busyAction = action;
    if (scan) {
      this.#scanProgress = {
        label: BUSY_LABELS[action] ?? "Starting scan…",
        detail: "Preparing scan inputs.",
        percent: 0,
        completed: 0,
        total: 0
      };
    }
    await this.#rerenderIfOpen();
    try {
      await operation(controller.signal);
      return true;
    } catch (error) {
      if (isAbortError(error) || controller.signal.aborted) return false;
      throw error;
    } finally {
      if (this.#operationController === controller) this.#operationController = null;
      this.#busyAction = null;
      if (scan) {
        if (this.#scanProgress) this.#lastScanProgress = { ...this.#scanProgress };
        this.#scanProgress = null;
      }
      await this.#rerenderIfOpen();
    }
  }

  #updateScanProgress(update = {}) {
    if (!this.#scanProgress || this.#closing) return;
    const percent = Number.isFinite(update.percent)
      ? Math.max(0, Math.min(100, update.percent))
      : this.#scanProgress.percent;
    this.#scanProgress = {
      ...this.#scanProgress,
      ...update,
      percent
    };

    const root = this.element;
    const progress = root?.querySelector("[data-rmd-scan-progress]");
    const percentLabel = root?.querySelector("[data-rmd-scan-progress-percent]");
    const label = root?.querySelector("[data-rmd-scan-progress-label]");
    const detail = root?.querySelector("[data-rmd-scan-progress-detail]");
    if (progress instanceof HTMLProgressElement) progress.value = percent;
    if (percentLabel) percentLabel.textContent = `${Math.round(percent)}%`;
    if (label) label.textContent = this.#scanProgress.label ?? "Scanning…";
    if (detail) detail.textContent = this.#scanProgress.detail ?? "";
  }

  async #rerenderIfOpen() {
    if (!this.#closing && this.rendered) await this.render();
  }

  #installHooks() {
    if (this.#hookIds.length > 0) return;
    const schedule = () => {
      if (this.#busyAction || this.#renderTimer || !this.rendered || this.#closing) return;
      this.#renderTimer = window.setTimeout(() => {
        this.#renderTimer = null;
        void this.#rerenderIfOpen().catch((error) => {
          this.#capture.record({
            channel: "diagnostics",
            level: "warn",
            message: `Diagnostics dashboard refresh failed: ${error instanceof Error ? error.message : String(error)}`,
            stack: error instanceof Error ? error.stack : ""
          }, { force: true });
        });
      }, 300);
    };
    this.#hookIds.push(
      [HOOKS.CAPTURE_STATE, Hooks.on(HOOKS.CAPTURE_STATE, schedule)],
      [HOOKS.SCAN_COMPLETE, Hooks.on(HOOKS.SCAN_COMPLETE, schedule)]
    );
  }

  #removeHooks() {
    for (const [hook, id] of this.#hookIds) Hooks.off(hook, id);
    this.#hookIds = [];
  }

  #scheduleWindowStateSave(position) {
    if (this.#closing) return;
    if (this.#positionSaveTimer) window.clearTimeout(this.#positionSaveTimer);
    this.#positionSaveTimer = window.setTimeout(() => {
      this.#positionSaveTimer = null;
      void this.#persistWindowState(position);
    }, 250);
  }

  async #persistWindowState(position) {
    const state = Object.fromEntries(
      ["top", "left", "width", "height"]
        .filter((key) => Number.isFinite(position?.[key]))
        .map((key) => [key, position[key]])
    );
    if (Object.keys(state).length === 0) return;
    try {
      await game.settings.set(MODULE_ID, "windowState", state);
    } catch (error) {
      this.#capture.record({
        channel: "diagnostics",
        level: "warn",
        message: `Could not save diagnostics window state: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : ""
      }, { force: true });
    }
  }
}
