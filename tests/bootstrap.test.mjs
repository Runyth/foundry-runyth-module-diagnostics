// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";

test("module bootstrap registers the shared dashboard menu and world-scoped player access", async () => {
  const onceCallbacks = new Map();
  const menus = [];
  const settings = [];

  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class ApplicationV2 {},
        HandlebarsApplicationMixin: (Base) => class extends Base {}
      }
    }
  };
  globalThis.Hooks = {
    once: (name, callback) => onceCallbacks.set(name, callback)
  };
  globalThis.game = {
    settings: {
      registerMenu: (namespace, key, data) => menus.push({ namespace, key, data }),
      register: (namespace, key, data) => settings.push({ namespace, key, data })
    }
  };

  await import(`../src/module/scripts/main.js?bootstrap=${Date.now()}`);
  assert.equal(typeof onceCallbacks.get("init"), "function");
  onceCallbacks.get("init")();

  assert.equal(menus.length, 1);
  assert.equal(menus[0].namespace, "runyth-module-diagnostics");
  assert.equal(menus[0].data.restricted, false);
  assert.deepEqual(
    settings.map((setting) => setting.key).sort(),
    ["backgroundCapture", "captureLongTasks", "maxEntries", "playerAccess", "windowState"].sort()
  );
  const playerAccess = settings.find((setting) => setting.key === "playerAccess");
  assert.equal(playerAccess.data.scope, "world");
  assert.equal(playerAccess.data.config, false);
  assert.deepEqual(playerAccess.data.default, { allowedUserIds: [] });

  delete globalThis.foundry;
  delete globalThis.Hooks;
  delete globalThis.game;
});

test("unauthorized players receive only the minimal guarded API", async () => {
  const onceCallbacks = new Map();
  const moduleRecord = {};
  const warnings = [];

  globalThis.foundry = {
    applications: {
      api: {
        ApplicationV2: class ApplicationV2 {},
        HandlebarsApplicationMixin: (Base) => class extends Base {}
      }
    }
  };
  globalThis.Hooks = {
    once: (name, callback) => onceCallbacks.set(name, callback)
  };
  globalThis.game = {
    user: { id: "p2", name: "Player Two", isGM: false },
    users: [
      { id: "gm", name: "GM", isGM: true, active: true },
      { id: "p1", name: "Player One", isGM: false, active: true },
      { id: "p2", name: "Player Two", isGM: false, active: true }
    ],
    i18n: { localize: (key) => key },
    modules: { get: () => moduleRecord },
    settings: {
      registerMenu: () => {},
      register: () => {},
      get: (_namespace, key) => key === "playerAccess" ? { allowedUserIds: ["p1"] } : null
    }
  };
  globalThis.ui = {
    notifications: { warn: (message) => warnings.push(message) }
  };

  await import(`../src/module/scripts/main.js?unauthorized=${Date.now()}`);
  onceCallbacks.get("init")();
  onceCallbacks.get("ready")();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(Object.keys(moduleRecord.api).sort(), ["isAuthorized", "open", "version"]);
  assert.equal(moduleRecord.api.version, 2);
  assert.equal(moduleRecord.api.isAuthorized(), false);
  assert.equal(moduleRecord.api.open(), null);
  assert.deepEqual(warnings, ["RMD.Notifications.NotAuthorized"]);

  delete globalThis.ui;
  delete globalThis.foundry;
  delete globalThis.Hooks;
  delete globalThis.game;
});
