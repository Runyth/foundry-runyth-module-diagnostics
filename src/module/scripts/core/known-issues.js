// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
export const KNOWN_ISSUES = Object.freeze([
  {
    id: "asset-404-or-mime",
    severity: "error",
    title: "Missing asset or incorrect MIME type",
    patterns: [
      /failed to load resource.*404/iu,
      /refused to apply style.*mime type/iu,
      /net::err_aborted.*404/iu,
      /not a supported stylesheet mime type/iu
    ],
    summary: "A manifest-declared script, stylesheet, template, image, or other asset is not being served from the expected path, or the server returned an HTML error page instead of the requested asset.",
    checks: [
      "Compare module.json paths with the actual ZIP directory structure and exact filename casing.",
      "Open the failing URL directly and confirm its HTTP status and Content-Type.",
      "Ensure the install ZIP contains one module directory and not an extra nested source directory."
    ]
  },
  {
    id: "recursive-freeze-cycle",
    severity: "error",
    title: "Recursive deep-freeze encountered a cyclic Foundry document graph",
    patterns: [
      /maximum call stack size exceeded/iu,
      /deepfreeze/iu,
      /object\.values/iu
    ],
    summary: "Foundry Documents and related runtime objects can contain circular or very deep references. Generic recursive cloning or freezing can recurse without a bound or cycle guard.",
    checks: [
      "Do not deep-freeze live Actor, Token, Scene, Item, Application, or Collection instances.",
      "Extract the minimal plain-data snapshot needed by the module.",
      "Use a WeakSet cycle guard and an explicit maximum depth when recursively traversing unknown objects."
    ]
  },
  {
    id: "legacy-application-api",
    severity: "warning",
    title: "Legacy Application API used in an ApplicationV2 environment",
    patterns: [
      /applicationv2/iu,
      /renderapplication/iu,
      /activateListeners/iu,
      /html\.find is not a function/iu
    ],
    summary: "Foundry's newer applications use ApplicationV2 and native HTMLElement-oriented render lifecycles. V1 assumptions such as jQuery wrappers or broad renderApplication hooks can break or interfere with unrelated windows.",
    checks: [
      "Use ApplicationV2 and HandlebarsApplicationMixin for new module applications.",
      "Scope render hooks to the exact application class or app id.",
      "Treat rendered content as native DOM unless the documented hook explicitly supplies another type."
    ]
  },
  {
    id: "broad-css-interference",
    severity: "warning",
    title: "Broad CSS selector may alter unrelated Foundry or module UI",
    patterns: [
      /broad css/iu,
      /style.*overlap/iu,
      /obstruct/iu,
      /z-index/iu
    ],
    summary: "Unscoped selectors, fixed overlays, or excessive z-index values can leak into sheets, dialogs, chat, pop-outs, or third-party applications.",
    checks: [
      "Prefix every selector with the module application's stable root class.",
      "Avoid element-only selectors such as button, input, label, form, or .window-content.",
      "Render controls only inside the intended application and avoid fixed viewport positioning."
    ]
  },
  {
    id: "duplicate-registration",
    severity: "warning",
    title: "Duplicate hooks, listeners, controls, or DOM identifiers",
    patterns: [
      /already registered/iu,
      /duplicate/iu,
      /cannot redefine/iu,
      /multiple elements.*same id/iu
    ],
    summary: "Repeated initialization or render-time global listener registration can duplicate behavior and cause escalating performance or UI interference.",
    checks: [
      "Register global hooks once during init or ready and retain their hook ids.",
      "Remove owned listeners and observers during teardown or application close.",
      "Use idempotent injection guards and module-prefixed DOM identifiers."
    ]
  },
  {
    id: "dependency-version-mismatch",
    severity: "warning",
    title: "Dependency or compatibility range mismatch",
    patterns: [
      /dependency.*missing/iu,
      /requires.*version/iu,
      /incompatible/iu,
      /could not satisfy/iu
    ],
    summary: "A module, system, or Foundry version may fall outside the package's declared compatibility or relationship range.",
    checks: [
      "Review module.json compatibility and relationships against installed package versions.",
      "Avoid assuming optional integrations are active; feature-detect their public API.",
      "Include exact Foundry, game-system, and related-module versions in the issue report."
    ]
  },
  {
    id: "unhandled-promise",
    severity: "error",
    title: "Unhandled asynchronous failure",
    patterns: [
      /unhandledrejection/iu,
      /uncaught \(in promise\)/iu,
      /promise rejection/iu
    ],
    summary: "An async operation rejected without a local error boundary, often obscuring which user action or package initiated the failure.",
    checks: [
      "Await asynchronous Foundry operations and handle expected failures locally.",
      "Preserve the original Error and stack when rethrowing with additional context.",
      "Reproduce with a focused capture started immediately before the triggering action."
    ]
  },
  {
    id: "performance-long-task",
    severity: "warning",
    title: "Long main-thread task or synchronous traversal",
    patterns: [
      /long task/iu,
      /performance/iu,
      /forced reflow/iu,
      /violation/iu
    ],
    summary: "A long synchronous task can freeze Foundry's interface. Common causes include scanning all documents repeatedly, recursive traversal, excessive DOM work, and heavy work in render hooks.",
    checks: [
      "Move expensive work out of high-frequency hooks and cache stable results.",
      "Bound collection sizes and recursive traversal depth.",
      "Use targeted selectors and batch DOM reads/writes."
    ]
  }
]);

export function matchKnownIssues(evidence = []) {
  const joined = evidence.map((entry) => `${entry.message ?? ""}\n${entry.stack ?? ""}\n${entry.location ?? ""}`).join("\n");
  return KNOWN_ISSUES
    .map((issue) => ({
      ...issue,
      matched: issue.patterns.some((pattern) => pattern.test(joined))
    }))
    .filter((issue) => issue.matched);
}
