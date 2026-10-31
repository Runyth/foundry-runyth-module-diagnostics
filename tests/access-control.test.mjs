// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Runyth. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAllowedUserIds,
  isDiagnosticsAuthorized,
  sanitizeAllowedUserIds,
  selectablePlayerUsers,
  setAllowedUserIds
} from "../src/module/scripts/core/access-control.js";

function users() {
  return [
    { id: "gm", name: "GM", isGM: true, active: true },
    { id: "p2", name: "Zed", isGM: false, active: false },
    { id: "p1", name: "Anna", isGM: false, active: true }
  ];
}

test("allowed user ids are normalized and deduplicated", () => {
  assert.deepEqual(normalizeAllowedUserIds({ allowedUserIds: [" p1 ", "p1", "", 7, "p2"] }), ["p1", "p2"]);
  assert.deepEqual(normalizeAllowedUserIds(["p2", "p1"]), ["p2", "p1"]);
});

test("Game Masters are always authorized while players require explicit selection", () => {
  assert.equal(isDiagnosticsAuthorized({ id: "gm", isGM: true }, []), true);
  assert.equal(isDiagnosticsAuthorized({ id: "p1", isGM: false }, ["p1"]), true);
  assert.equal(isDiagnosticsAuthorized({ id: "p2", isGM: false }, ["p1"]), false);
});

test("selectable users exclude GMs and remain stably sorted", () => {
  assert.deepEqual(selectablePlayerUsers(users()), [
    { id: "p1", name: "Anna", active: true },
    { id: "p2", name: "Zed", active: false }
  ]);
});

test("saved player access drops unknown and GM user ids", () => {
  assert.deepEqual(sanitizeAllowedUserIds(["gm", "p2", "missing", "p1", "p2"], users()), ["p2", "p1"]);
});

test("only a GM can persist the world access list", async () => {
  const writes = [];
  globalThis.game = {
    user: { id: "gm", isGM: true },
    users: users(),
    i18n: { localize: (key) => key },
    settings: {
      set: async (namespace, key, value) => writes.push({ namespace, key, value })
    }
  };
  assert.deepEqual(await setAllowedUserIds(["gm", "p1", "missing"]), ["p1"]);
  assert.deepEqual(writes, [{
    namespace: "runyth-module-diagnostics",
    key: "playerAccess",
    value: { allowedUserIds: ["p1"] }
  }]);

  globalThis.game.user = { id: "p1", isGM: false };
  await assert.rejects(() => setAllowedUserIds(["p1"]), /RMD\.Notifications\.GmOnlyAccess/u);
  delete globalThis.game;
});
