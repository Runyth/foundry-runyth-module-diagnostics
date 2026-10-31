// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import { DiagnosticsApp } from "./app/diagnostics-app.js";
import {
  ACCESS_SETTING_KEY,
  getAllowedUserIds,
  isDiagnosticsAuthorized,
  setAllowedUserIds
} from "./core/access-control.js";
import {
  DEFAULT_MAX_ENTRIES,
  MAX_CAPTURE_ENTRIES,
  MODULE_ID
} from "./core/constants.js";
import { CaptureService } from "./services/capture-service.js";
import { DiagnosticsService } from "./services/diagnostics-service.js";
import { ReportService } from "./services/report-service.js";

let captureService = null;
let diagnosticsService = null;
let reportService = null;
let accessSyncPromise = Promise.resolve();

class DiagnosticsMenuApp extends foundry.applications.api.ApplicationV2 {
  render() {
    openDashboard();
    return Promise.resolve(this);
  }
}


function registerSettings() {
  game.settings.register(MODULE_ID, ACCESS_SETTING_KEY, {
    scope: "world",
    config: false,
    type: Object,
    default: { allowedUserIds: [] },
    onChange: () => {
      accessSyncPromise = accessSyncPromise.then(() => synchronizeAccess()).catch((error) => {
        console.error(`[${MODULE_ID}] Failed to synchronize diagnostics access`, error);
      });
    }
  });

  game.settings.registerMenu(MODULE_ID, "dashboard", {
    name: "RMD.Menu.Name",
    label: "RMD.Menu.Label",
    hint: "RMD.Menu.Hint",
    icon: "fa-solid fa-stethoscope",
    type: DiagnosticsMenuApp,
    restricted: false
  });

  game.settings.register(MODULE_ID, "backgroundCapture", {
    name: "RMD.Settings.BackgroundCapture.Name",
    hint: "RMD.Settings.BackgroundCapture.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => captureService?.setBackgroundEnabled(value)
  });

  game.settings.register(MODULE_ID, "maxEntries", {
    name: "RMD.Settings.MaxEntries.Name",
    hint: "RMD.Settings.MaxEntries.Hint",
    scope: "client",
    config: true,
    type: Number,
    range: { min: 100, max: MAX_CAPTURE_ENTRIES, step: 100 },
    default: DEFAULT_MAX_ENTRIES,
    onChange: (value) => captureService?.setLimit(value)
  });

  game.settings.register(MODULE_ID, "captureLongTasks", {
    name: "RMD.Settings.CaptureLongTasks.Name",
    hint: "RMD.Settings.CaptureLongTasks.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: (value) => captureService?.setLongTaskCapture(value)
  });

  game.settings.register(MODULE_ID, "windowState", {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}

function initializeServices() {
  if (captureService || !isDiagnosticsAuthorized()) return false;
  captureService = new CaptureService({ maxEntries: game.settings.get(MODULE_ID, "maxEntries") });
  diagnosticsService = new DiagnosticsService(captureService);
  reportService = new ReportService(captureService, diagnosticsService);
  captureService.install({
    backgroundEnabled: game.settings.get(MODULE_ID, "backgroundCapture"),
    captureLongTasks: game.settings.get(MODULE_ID, "captureLongTasks")
  });
  return true;
}

function clearServices() {
  captureService?.uninstall();
  captureService = null;
  diagnosticsService = null;
  reportService = null;
}

function openDashboard() {
  if (!isDiagnosticsAuthorized()) {
    ui.notifications.warn(game.i18n.localize("RMD.Notifications.NotAuthorized"));
    return null;
  }
  initializeServices();
  if (!captureService || !diagnosticsService || !reportService) return null;
  const application = DiagnosticsApp.instance ?? new DiagnosticsApp(captureService, diagnosticsService, reportService);
  if (application.rendered) application.bringToFront();
  else void application.render({ force: true });
  return application;
}

function exposeApi() {
  const module = game.modules.get(MODULE_ID);
  if (!module) return;
  const authorized = isDiagnosticsAuthorized();
  const base = {
    version: 2,
    isAuthorized: () => isDiagnosticsAuthorized(),
    open: openDashboard
  };
  if (!authorized || !captureService || !diagnosticsService || !reportService) {
    module.api = Object.freeze(base);
    return;
  }
  const diagnosticsApi = {
    ...base,
    getCaptureState: () => captureService.state,
    getEntries: (options = {}) => captureService.entries(options),
    startCapture: (options = {}) => captureService.startFocused(options),
    stopCapture: () => captureService.stopFocused(),
    clearCapture: () => captureService.clear(),
    record: (entry) => captureService.record(entry, { force: true }),
    getEnvironment: () => diagnosticsService.environmentSnapshot(),
    runScan: (name, selectedModuleIds = null, options = {}) => diagnosticsService.runScan(name, selectedModuleIds, options),
    runAllScans: (selectedModuleIds = null, options = {}) => diagnosticsService.runAll(selectedModuleIds, options),
    buildReport: (options = {}) => reportService.buildReport(options),
    exportReport: (options = {}) => reportService.exportZip(options)
  };
  if (game.user?.isGM) {
    diagnosticsApi.getPlayerAccess = () => getAllowedUserIds();
    diagnosticsApi.setPlayerAccess = (userIds) => setAllowedUserIds(userIds);
  }
  module.api = Object.freeze(diagnosticsApi);
}

async function synchronizeAccess() {
  if (isDiagnosticsAuthorized()) {
    initializeServices();
    exposeApi();
    return;
  }
  const application = DiagnosticsApp.instance;
  if (application?.rendered) {
    try {
      await application.close();
    } catch (error) {
      console.warn(`[${MODULE_ID}] Could not close diagnostics dashboard after access revocation`, error);
    }
  }
  clearServices();
  exposeApi();
}

Hooks.once("init", () => {
  registerSettings();
  initializeServices();
});

Hooks.once("ready", () => {
  accessSyncPromise = accessSyncPromise.then(() => synchronizeAccess()).catch((error) => {
    console.error(`[${MODULE_ID}] Failed to initialize diagnostics access`, error);
  });
});
