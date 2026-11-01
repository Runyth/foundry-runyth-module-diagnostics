// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { CaptureService } from "../src/module/scripts/services/capture-service.js";

test("focused capture tags only matching entries and preserves the completed session", () => {
  const service = new CaptureService({ maxEntries: 10 });
  service.startFocused({ selectedModuleIds: ["example"], includeUnknown: false, levels: ["warn", "error"] });
  const sessionId = service.state.focused.id;

  const included = service.record({
    level: "error",
    message: "Failure",
    sourceUrl: "https://host/modules/example/main.js"
  });
  const excluded = service.record({
    level: "warn",
    message: "Other warning",
    sourceUrl: "https://host/modules/other/main.js"
  });

  assert.equal(included.focusedSessionId, sessionId);
  assert.equal(excluded, null);
  service.stopFocused();
  assert.equal(service.state.focused, null);
  assert.equal(service.state.lastFocusedSession.id, sessionId);
  assert.equal(service.state.lastFocusedSession.retainedEntries, 1);
  assert.equal(service.entries({ focusedSessionId: sessionId }).length, 1);
});

test("clearing capture removes completed focused-session metadata", () => {
  const service = new CaptureService({ maxEntries: 10 });
  service.startFocused({ selectedModuleIds: null });
  service.record({ level: "log", message: "Captured" });
  service.stopFocused();
  service.clear();
  assert.equal(service.state.lastFocusedSession, null);
  assert.equal(service.state.size, 0);
});

test("discarded console levels do not serialize payloads", () => {
  const service = new CaptureService({ maxEntries: 10 });
  let reads = 0;
  const payload = {
    get expensive() {
      reads += 1;
      return "value";
    }
  };

  assert.equal(service.record({ level: "log", data: payload }), null);
  assert.equal(reads, 0);

  service.setBackgroundEnabled(true);
  assert.ok(service.record({ level: "warn", data: payload }));
  assert.equal(reads, 1);
});

test("console wrappers exist only for an explicit focused capture and are restored afterwards", () => {
  const service = new CaptureService({ maxEntries: 10 });
  const original = new Map([
    ["debug", console.debug],
    ["info", console.info],
    ["log", console.log],
    ["warn", console.warn],
    ["error", console.error]
  ]);

  service.setBackgroundEnabled(true);
  for (const [level, fn] of original) assert.equal(console[level], fn);

  service.startFocused({ selectedModuleIds: null, levels: ["error"] });
  assert.notEqual(console.error, original.get("error"));
  assert.equal(console.log, original.get("log"));

  service.stopFocused();
  for (const [level, fn] of original) assert.equal(console[level], fn);
});
