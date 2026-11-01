// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import assert from "node:assert/strict";
import test from "node:test";
import { DiagnosticsService } from "../src/module/scripts/services/diagnostics-service.js";

function packageFixture(overrides = {}) {
  return {
    id: "example",
    title: "Example",
    version: "1.0.0",
    active: true,
    compatibility: { minimum: "13", verified: "13.351", maximum: "14" },
    relationships: {
      requires: new Set(),
      recommends: new Set(),
      conflicts: new Set(),
      systems: new Set()
    },
    authors: new Set([{ name: "Author" }]),
    esmodules: new Set(),
    scripts: new Set(),
    styles: [],
    languages: new Set(),
    flags: {},
    ...overrides
  };
}

test("relationship scan supports Foundry iterable relationship collections", () => {
  const dependency = { id: "missing", type: "module", compatibility: {}, reason: "Needed" };
  const module = packageFixture({
    relationships: {
      requires: new Set([dependency]),
      recommends: new Set(),
      conflicts: new Set(),
      systems: new Set()
    }
  });
  globalThis.game = {
    modules: new Map([[module.id, module]]),
    system: { id: "dnd5e" }
  };

  const service = new DiagnosticsService({});
  const result = service.scanRelationships(["example"]);
  assert.equal(result.summary.checked, 1);
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].message, /requires active module 'missing'/u);
  delete globalThis.game;
});


test("relationship scan detects installed dependency versions outside the declared range", () => {
  const dependency = packageFixture({ id: "dependency", title: "Dependency", version: "1.0.0" });
  const module = packageFixture({
    relationships: {
      requires: new Set([{
        id: "dependency",
        type: "module",
        compatibility: { minimum: "2.0.0", maximum: "3.0.0" },
        reason: "Needed"
      }]),
      recommends: new Set(),
      conflicts: new Set(),
      systems: new Set()
    }
  });
  globalThis.game = {
    modules: new Map([[module.id, module], [dependency.id, dependency]]),
    system: { id: "dnd5e", version: "5.3.3" }
  };
  globalThis.foundry = {
    utils: {
      isNewerVersion: (left, right) => left.localeCompare(right, undefined, { numeric: true }) > 0
    }
  };

  const result = new DiagnosticsService({}).scanRelationships(["example"]);
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].message, /outside the declared version range/u);
  delete globalThis.game;
  delete globalThis.foundry;
});

test("asset and static scans support Set assets and v13 style objects", async () => {
  const module = packageFixture({
    esmodules: new Set(["scripts/main.js"]),
    styles: [{ src: "styles/main.css" }]
  });
  globalThis.game = {
    modules: new Map([[module.id, module]]),
    system: { id: "dnd5e" }
  };
  globalThis.foundry = {
    utils: {
      getRoute: (value) => `/route/${value}`
    }
  };
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    if (url.endsWith(".js")) {
      return new Response("class Legacy extends Application {}", {
        status: 200,
        headers: { "content-type": "text/javascript" }
      });
    }
    return new Response("button { position: fixed; z-index: 9999; }", {
      status: 200,
      headers: { "content-type": "text/css" }
    });
  };

  const service = new DiagnosticsService({});
  const assets = await service.runScan("assets", ["example"]);
  const source = await service.runScan("source", ["example"]);
  const css = await service.runScan("css", ["example"]);

  assert.equal(assets.summary.checked, 2);
  assert.deepEqual(requested.sort(), [
    "/route/modules/example/scripts/main.js",
    "/route/modules/example/styles/main.css"
  ]);
  assert(source.findings.some((finding) => finding.ruleId === "legacy-application-global"));
  assert(css.findings.some((finding) => finding.message === "Unscoped element selector"));
  assert(css.findings.some((finding) => finding.message === "Very high z-index"));

  delete globalThis.game;
  delete globalThis.foundry;
  delete globalThis.fetch;
});

test("supported-system relationships default to system packages when type is omitted", () => {
  const module = packageFixture({
    relationships: {
      requires: new Set(),
      recommends: new Set(),
      conflicts: new Set(),
      systems: new Set([{
        id: "dnd5e",
        compatibility: { minimum: "5.0.0", maximum: "6.0.0" }
      }])
    }
  });
  globalThis.game = {
    modules: new Map([[module.id, module]]),
    system: { id: "dnd5e", version: "5.3.3" }
  };
  globalThis.foundry = {
    utils: {
      isNewerVersion: (left, right) => left.localeCompare(right, undefined, { numeric: true }) > 0
    }
  };

  const result = new DiagnosticsService({}).scanRelationships(["example"]);
  assert.equal(result.findings.length, 0);

  delete globalThis.game;
  delete globalThis.foundry;
});

test("aborting an asset scan does not publish a partial scan result", async () => {
  const module = packageFixture({ esmodules: new Set(["scripts/main.js"]) });
  globalThis.game = {
    modules: new Map([[module.id, module]]),
    system: { id: "dnd5e", version: "5.3.3" }
  };
  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });

  const controller = new AbortController();
  const service = new DiagnosticsService({});
  const pending = service.runScan("assets", ["example"], { signal: controller.signal });
  controller.abort(new DOMException("Test cancellation", "AbortError"));

  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(service.scanResults.assets, undefined);

  delete globalThis.game;
  delete globalThis.fetch;
});

test("asset scan accepts Foundry V13 already-rooted package paths without duplicating the module root", async () => {
  const module = packageFixture({
    esmodules: new Set(["modules/example/scripts/main.js"]),
    styles: [{ src: "modules/example/styles/main.css" }]
  });
  globalThis.game = {
    modules: new Map([[module.id, module]]),
    system: { id: "dnd5e", version: "5.3.3" }
  };
  globalThis.foundry = {
    utils: {
      getRoute: (value) => `/route/${value}`
    }
  };
  const requested = [];
  globalThis.fetch = async (url) => {
    requested.push(url);
    return new Response(url.endsWith(".css") ? ".example {}" : "export {};", {
      status: 200,
      headers: { "content-type": url.endsWith(".css") ? "text/css" : "text/javascript" }
    });
  };

  try {
    const result = await new DiagnosticsService({}).runScan("assets", ["example"]);
    assert.equal(result.summary.checked, 2);
    assert.deepEqual(requested.sort(), [
      "/route/modules/example/scripts/main.js",
      "/route/modules/example/styles/main.css"
    ]);
    assert.equal(requested.some((url) => url.includes("modules/example/modules/example")), false);
  } finally {
    delete globalThis.game;
    delete globalThis.foundry;
    delete globalThis.fetch;
  }
});

test("relationship scan never touches deprecated pre-V10 core-version getters", () => {
  const module = packageFixture({ compatibility: undefined });
  for (const key of ["minimumCoreVersion", "compatibleCoreVersion", "maximumCoreVersion"]) {
    Object.defineProperty(module, key, {
      configurable: true,
      get() {
        throw new Error(`Deprecated getter touched: ${key}`);
      }
    });
  }
  globalThis.game = {
    modules: new Map([[module.id, module]]),
    system: { id: "dnd5e", version: "5.3.3" }
  };

  try {
    const result = new DiagnosticsService({}).scanRelationships(["example"]);
    assert.equal(result.summary.checked, 1);
  } finally {
    delete globalThis.game;
  }
});

test("asset scan emits monotonic progress ending at 100 percent", async () => {
  const module = packageFixture({
    esmodules: new Set(["scripts/one.js", "scripts/two.js", "scripts/three.js"])
  });
  globalThis.game = {
    modules: new Map([[module.id, module]]),
    system: { id: "dnd5e", version: "5.3.3" }
  };
  globalThis.fetch = async () => new Response("export {};", {
    status: 200,
    headers: { "content-type": "text/javascript" }
  });
  const progress = [];

  try {
    await new DiagnosticsService({}).runScan("assets", ["example"], {
      onProgress: (update) => progress.push(update.percent)
    });
    assert.ok(progress.length >= 4);
    assert.equal(progress.at(-1), 100);
    for (let index = 1; index < progress.length; index += 1) {
      assert.ok(progress[index] >= progress[index - 1]);
    }
  } finally {
    delete globalThis.game;
    delete globalThis.fetch;
  }
});
