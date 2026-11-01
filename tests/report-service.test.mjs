// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { ReportService } from "../src/module/scripts/services/report-service.js";

function environment() {
  return {
    generatedAt: "2026-07-29T00:00:00.000Z",
    foundry: { version: "13.351" },
    world: { system: "dnd5e", systemVersion: "5.3.3" },
    browser: {
      userAgent: "Browser secret-world",
      viewport: { width: 1000, height: 700, devicePixelRatio: 1 }
    },
    modules: [
      { id: "selected", title: "Selected", version: "1.0.0", active: true, compatibility: {} },
      { id: "other", title: "Other", version: "2.0.0", active: true, compatibility: {} },
      { id: "inactive", title: "Inactive", version: "3.0.0", active: false, compatibility: {} }
    ],
    systems: []
  };
}

test("buildReport limits package inventory and forwards focused-session filtering", () => {
  const calls = [];
  const capture = {
    state: { dropped: 0, lastFocusedSession: { id: 7 } },
    entries: (options) => {
      calls.push(options);
      return [{
        level: "error",
        message: "password=secret-value",
        stack: "at /modules/selected/main.js",
        location: "",
        attribution: {
          primaryModuleId: "selected",
          references: [{ packageType: "module", id: "selected" }]
        }
      }];
    }
  };
  const diagnostics = {
    environmentSnapshot: environment,
    scanResults: {}
  };
  const service = new ReportService(capture, diagnostics);
  const report = service.buildReport({
    selectedModuleIds: ["selected"],
    focusedSessionId: 7,
    customRedactions: ["secret-world"]
  });

  assert.equal(report.packageInventory, "selected-active-modules");
  assert.deepEqual(report.environment.modules.map((module) => module.id), ["selected"]);
  assert.deepEqual(report.selectedPackages.map((module) => module.id), ["selected"]);
  assert.equal(calls[0].focusedSessionId, 7);
  assert.doesNotMatch(JSON.stringify(report), /secret-value|secret-world/u);
});

test("buildReport can include the complete installed inventory", () => {
  const capture = {
    state: { dropped: 0 },
    entries: () => []
  };
  const diagnostics = {
    environmentSnapshot: environment,
    scanResults: {}
  };
  const report = new ReportService(capture, diagnostics).buildReport({
    selectedModuleIds: ["selected"],
    includeAllPackages: true
  });
  assert.equal(report.packageInventory, "complete-installed-inventory");
  assert.deepEqual(report.environment.modules.map((module) => module.id), ["selected", "other", "inactive"]);
});

test("importFile preserves separate files whose sanitized names collide", async () => {
  const capture = { state: { dropped: 0 }, entries: () => [] };
  const diagnostics = { environmentSnapshot: environment, scanResults: {} };
  const service = new ReportService(capture, diagnostics);

  await service.importFile(new File(["first"], "server log.txt", { type: "text/plain" }));
  await service.importFile(new File(["second"], "server log.txt", { type: "text/plain" }));

  assert.deepEqual(service.importedFiles.map((file) => file.name), ["server_log.txt", "server_log-2.txt"]);
});

test("exported Markdown uses a fence longer than backticks in captured evidence", async () => {
  const capture = {
    state: { dropped: 0 },
    entries: () => [{
      timestamp: "2026-08-02T12:00:00.000Z",
      level: "error",
      message: "Failure with ``` embedded fence",
      stack: "at /modules/selected/main.js",
      location: "",
      attribution: { primaryModuleId: "selected", references: [] }
    }]
  };
  const diagnostics = { environmentSnapshot: environment, scanResults: {} };
  let exportedBlob = null;
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  const originalHooks = globalThis.Hooks;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.document = {
    body: { append() {} },
    createElement: () => ({
      click() {},
      remove() {},
      set href(_value) {},
      set download(_value) {},
      set rel(_value) {}
    })
  };
  globalThis.URL = class TestURL extends originalUrl {
    static createObjectURL(blob) {
      exportedBlob = blob;
      return "blob:test";
    }

    static revokeObjectURL() {}
  };
  globalThis.Hooks = { callAll() {} };
  globalThis.setTimeout = (callback) => {
    callback();
    return 1;
  };

  try {
    new ReportService(capture, diagnostics).exportZip({ selectedModuleIds: ["selected"] });
    const bytes = new Uint8Array(await exportedBlob.arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let offset = 0;
    let markdown = "";
    while (view.getUint32(offset, true) === 0x04034b50) {
      const size = view.getUint32(offset + 18, true);
      const nameLength = view.getUint16(offset + 26, true);
      const extraLength = view.getUint16(offset + 28, true);
      const nameStart = offset + 30;
      const dataStart = nameStart + nameLength + extraLength;
      const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength));
      if (name === "issue-report.md") markdown = new TextDecoder().decode(bytes.slice(dataStart, dataStart + size));
      offset = dataStart + size;
    }
    assert.match(markdown, /````text\nFailure with ``` embedded fence/u);
    assert.match(markdown, /\n````\n/u);
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
    globalThis.Hooks = originalHooks;
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("exportZip tolerates selected packages with missing or malformed compatibility metadata", () => {
  const capture = {
    state: { dropped: 0 },
    entries: () => []
  };
  const diagnostics = {
    environmentSnapshot: () => ({
      generatedAt: "2026-08-12T21:30:00.000Z",
      foundry: { version: "13.351" },
      world: { system: "dnd5e", systemVersion: "5.3.3" },
      browser: {
        userAgent: "Browser",
        viewport: { width: 1000, height: 700, devicePixelRatio: 1 }
      },
      modules: [
        { id: "missing", title: "Missing compatibility", version: "1.0.0", active: true },
        { id: "malformed", title: "Malformed compatibility", version: "2.0.0", active: true, compatibility: "invalid" }
      ],
      systems: []
    }),
    scanResults: {}
  };
  const originalDocument = globalThis.document;
  const originalUrl = globalThis.URL;
  const originalHooks = globalThis.Hooks;
  const originalSetTimeout = globalThis.setTimeout;

  globalThis.document = {
    body: { append() {} },
    createElement: () => ({
      click() {},
      remove() {},
      set href(_value) {},
      set download(_value) {},
      set rel(_value) {}
    })
  };
  globalThis.URL = class TestURL extends originalUrl {
    static createObjectURL() {
      return "blob:test";
    }

    static revokeObjectURL() {}
  };
  globalThis.Hooks = { callAll() {} };
  globalThis.setTimeout = (callback) => {
    callback();
    return 1;
  };

  try {
    assert.doesNotThrow(() => new ReportService(capture, diagnostics).exportZip({
      selectedModuleIds: ["missing", "malformed"]
    }));
  } finally {
    globalThis.document = originalDocument;
    globalThis.URL = originalUrl;
    globalThis.Hooks = originalHooks;
    globalThis.setTimeout = originalSetTimeout;
  }
});
