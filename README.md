# Runyth Module Diagnostics

Runyth Module Diagnostics is a system-agnostic Foundry Virtual Tabletop module for collecting browser-side evidence, reviewing package compatibility, identifying likely interference patterns, and exporting privacy-aware reports suitable for third-party issue trackers. Game Masters always have access and may grant the same client-local diagnostics workflow to selected player users.

The module is designed for Foundry VTT 13 and forward-declares compatibility through Foundry VTT 14. It intentionally uses public APIs, ApplicationV2, bounded data structures, same-origin browser requests, and application-scoped UI. It does not disable modules, alter sheets, add scene controls, modify the HUD, patch Foundry prototypes, inspect private hook registries, or transmit diagnostics anywhere.

## Main capabilities

| Area | Capability |
|---|---|
| Evidence capture | Bounded ring buffer for focused console output plus background browser/runtime errors, unhandled rejections, Foundry's public error hook, CSP violations, and supported long-task entries |
| Package attribution | Best-effort module/system attribution from `/modules/<id>/` and `/systems/<id>/` paths in source URLs and stack text |
| Focused reproduction | Capture all packages or only selected active modules, preserve session boundaries, and optionally include unattributed events |
| Compatibility checks | Foundry compatibility metadata, required/recommended/conflicting relationships, and active-state checks |
| Asset verification | Same-origin GET verification of up to 500 manifest-declared scripts, styles, and language files, including V13 rooted-path normalization, HTTP status, MIME checks, bounded concurrency, per-request timeouts, and cancellation |
| Static review hints | Bounded scans of small declared JavaScript/CSS assets for common legacy API, global listener, prototype-patching, deep-freeze, broad selector, fixed overlay, and z-index patterns |
| Runtime UI evidence | Duplicate DOM identifier and fixed-position element inventory |
| Player access | GM-managed world access list for selected non-GM users; every authorized user captures and exports only their own browser-local evidence |
| Scan progress | Reserved, layout-stable progress region with stage, current package/asset detail, percentage, and weighted complete-suite progress |
| Performance evidence | Long-task capture where supported and module resource-timing summaries |
| Imported evidence | Optional console exports or server-log excerpts, up to 5 MB per file, with collision-safe sanitized filenames |
| Report export | A ZIP containing issue-ready Markdown, structured JSON, JSONL evidence, individual scan results, known-issue guidance, and imported text evidence |
| Privacy | Built-in secret, credential query parameter, host/origin, and IP-address redaction plus exact user-defined redaction terms |
| Integration API | Read-only snapshots, capture control, scan execution, report construction/export, and public notification hooks |

## Installation

Paste this manifest URL into Foundry's **Add-on Modules → Install Module** dialog:

```text
https://github.com/Runyth/foundry-runyth-module-diagnostics/releases/latest/download/module.json
```

The install archive's top-level directory is `runyth-module-diagnostics`.

The release ZIP deliberately contains the module directory as its single top-level directory, so it can be extracted directly into `Data/modules/`.

## Usage workflow

1. Open **Game Settings → Configure Settings → Module Settings → Module Diagnostics**. Game Masters may first open **Access** and select the player users who should be able to collect their own client evidence.
2. In **Capture**, select the suspected modules. Start focused capture immediately before reproducing the issue.
3. Perform the smallest exact action that triggers the defect, then stop capture. The completed focused session is retained as a report boundary.
4. In **Scans**, run selected checks or all checks. Treat static findings as review leads rather than proof.
5. In **Report**, enter reproduction steps, expected behavior, and actual behavior. Optionally import browser-console text or server-log excerpts.
6. Choose whether to include only selected active modules or the complete installed module inventory, then add any exact private terms that the built-in redactor cannot recognize.
7. Export the report ZIP, inspect every file, and then attach the relevant material to the issue tracker.

## Important evidence boundaries

- Browser modules cannot recover console history created before focused capture began. Console methods are wrapped only while focused capture is active, and only for the requested levels.
- Browser modules cannot read Foundry server logs from the server filesystem. Server evidence must be imported explicitly.
- Source-path attribution shows which package path appears in available evidence. It does not prove that the package caused the error.
- Static scans identify patterns requiring review. They do not determine reachability, execution context, or root cause.
- Asset scanning is bounded to 500 declared assets, six concurrent requests, 10 seconds per request, 2 MB per asset, 20 MB of in-memory source cache, and 1,000 static findings per scan.
- Fetched third-party source is retained only in volatile memory while scanning and is never included in an exported report.
- Automatic redaction cannot guarantee removal of every private value. A human privacy review is mandatory before uploading reports.

## Settings and access

| Setting | Scope | Default | Purpose |
|---|---|---:|---|
| Player diagnostics access | World | No players | GM-managed IDs of non-GM users permitted to initialize and open diagnostics; GMs are always authorized |
| Capture background runtime errors | Client | Enabled | Retains bounded browser/runtime error evidence without permanently wrapping console methods |
| Maximum captured entries | Client | 2,000 | Controls the ring-buffer limit; oldest entries are discarded first |
| Capture long tasks | Client | Enabled | Uses the browser PerformanceObserver when `longtask` is supported |

Window position and dimensions are stored as a hidden client setting.

## Public API

After the `ready` hook for a Game Master or an authorized player client:

```javascript
const diagnostics = game.modules.get("runyth-module-diagnostics").api;

// Check whether this user is currently permitted to use diagnostics.
if (!diagnostics.isAuthorized()) return;

// Open or focus the dashboard.
diagnostics.open();

// Begin a focused capture for specific modules.
diagnostics.startCapture({
  selectedModuleIds: ["example-module"],
  includeUnknown: true,
  levels: ["warn", "error"]
});

// Run all scans for selected modules and build a redacted report object.
await diagnostics.runAllScans(["example-module"]);
const report = diagnostics.buildReport({
  selectedModuleIds: ["example-module"],
  summary: "Describe the failure",
  focusedSessionId: diagnostics.getCaptureState().lastFocusedSession?.id ?? null,
  includeAllPackages: false,
  customRedactions: ["private-world-name"]
});
```

Game Masters additionally receive `getPlayerAccess()` and `setPlayerAccess(userIds)` for supported access administration. Full API details are documented in [`docs/API.md`](docs/API.md).

## Development

Requirements:

- Node.js 22.13.0 through 26.x
- npm 10 or newer

```text
npm ci
npm run check
npm run check:determinism
```

`npm run check` executes tests, builds the installable directory, validates the manifest and package constraints, and creates all three release ZIPs. Packaging uses a dependency-free stored-ZIP implementation with sorted entries and fixed timestamps.

## Release artifacts

Every release produces the same-version set:

1. `runyth-module-diagnostics-v<version>-mod.zip` — ready-to-install runtime module.
2. `runyth-module-diagnostics-v<version>-src.zip` — source archive.
3. `runyth-module-diagnostics-v<version>-doc.zip` — documentation, audit, release notes, and test evidence.

The release also supplies SHA-256 checksums, the standalone manifest, and a validation record.

## Licence
Copyright © 2026  [Daniel Braniewski](https://brani.dev/)

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
