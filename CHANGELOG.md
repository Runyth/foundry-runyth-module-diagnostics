# Changelog

## 1.1.2 — 2026-11-01

- Attributed the source licence headers to the same holder the README Licence chapter names so every module surface carries the same copyright holder.

- All notable changes are documented here. Versions follow Semantic Versioning.

## 1.1.1 — 2026-08-12

- Licensed the program under AGPL-3.0-or-later.
- Published install, source, and documentation archives as `-mod`, `-src`, and `-doc`.

- Fixed focused-diagnostics report actions repeatedly failing with `Cannot read properties of undefined (reading 'minimum')` when a selected package snapshot has missing or malformed compatibility metadata.
- Made issue-tracker Markdown generation tolerant of absent compatibility, environment, evidence, guidance, and scan substructures instead of allowing one malformed snapshot to abort the complete report ZIP.
- Preserved the underlying diagnostic evidence and represented unavailable compatibility values as `—` rather than fabricating version bounds.

- Added a regression test that reproduces the exact `compatibility.minimum` failure with both missing and malformed compatibility metadata.
- Added a static release gate preventing direct dereferences of optional package compatibility fields in report generation.

## 1.1.0 — 2026-08-12

- Added GM-managed per-player diagnostics authorization through a world-scoped access list. Game Masters remain permanently authorized.
- Added a searchable, scrollable **Access** tab listing non-GM Foundry users with online/offline status, bulk allow/deny controls, and explicit save behavior.
- Authorized players can use capture, compatibility scans, guidance, imported evidence, and report ZIP export from their own browser client.
- Added API v2 authorization introspection plus GM-only `getPlayerAccess()` and `setPlayerAccess(userIds)` administration helpers.
- Added English and German localization for the complete player-access workflow and permission notifications.

- Player evidence remains client-local and is never synchronized to the GM or other players; sending a report remains an explicit export-and-share action.
- Access revocation closes the affected local dashboard, uninstalls capture listeners/observers, restores temporary console wrappers, and discards that client's in-memory diagnostics service instance.
- Unauthorized clients expose only the minimal API surface required to query authorization and request the dashboard; capture, scan, report, and access mutation methods are not exposed.
- The GM-only Access tab and administration helpers are protected in the rendered UI, event handler, access service, and public API boundary; player API objects do not expose access-administration methods.

- Added regression tests for authorization normalization, GM-always access, non-GM selection, stale/GM ID rejection, world-setting persistence, the shared settings-menu registration model, and the minimal API exposed to unauthorized clients.
- Expanded the manual acceptance matrix for grant, revoke, reconnect, independent client evidence, and player privilege boundaries.

## 1.0.2 — 2026-08-09

- Corrected Foundry V13 asset-path normalization so already-rooted package paths such as `modules/example/scripts/main.js` are not incorrectly requested as `modules/example/modules/example/scripts/main.js`.
- Removed compatibility fallbacks through deprecated pre-V10 core-version fields that could throw while scanning malformed third-party package metadata; relationship scans now use the modern `compatibility` object defensively.
- Stopped permanently wrapping browser console methods during background capture, preventing unrelated DevTools entries from being reported as originating inside `capture-service.js`.
- Limited focused console wrappers to exactly the requested levels and guaranteed stale wrappers are restored before a replacement focused session starts.
- Added synthetic caller stacks for focused console calls without `Error` arguments while stripping diagnostics-internal stack frames from stored evidence.
- Removed scan-completion toast notifications that added repeated diagnostics noise to the console during large scan sessions.
- Removed duplicate click-prevention and progress-label assignments found during the patch audit.

- Added a permanently reserved, layout-stable scan progress region with stage label, current package/asset detail, percentage, and native progress semantics.
- Added granular progress reporting to relationship, asset, source, CSS, DOM, and resource scans.
- Added weighted aggregate progress for the complete six-stage scan suite so asset/source work contributes proportionally to the displayed percentage.
- Added public `onProgress` callback support for `runScan` and `runAllScans`.
- Expanded regression coverage for V13 rooted asset paths, deprecated compatibility getter isolation, scan progress monotonicity, and focused-only console wrapping.
- Added the standard third documentation/audit/test-results ZIP to release packaging.

## 1.0.1 — 2026-08-09

- Avoided serializing discarded low-level console payloads, reducing overhead and preventing side-effecting getters from being touched when no matching capture is active.
- Correctly treated `relationships.systems` entries without an explicit type as system relationships instead of module dependencies.
- Made asset and source scans cancellable, bounded asset requests to 10 seconds, limited asset-request concurrency, and prevented aborted scans from publishing partial results.
- Prevented long-running scans and imports from reopening the diagnostics window after it was closed.
- Made window position persistence non-blocking so settings writes cannot delay or prevent ApplicationV2 closure.
- Corrected the report layout so the report form receives the flexible column and the sidebar remains bounded.
- Added control padding, responsive overflow handling, wrapped button labels, accessible focus states, and narrow-window layout behavior.
- Preserved separately imported evidence files when sanitized filenames collide by assigning deterministic suffixes.
- Kept generated issue-report Markdown valid when captured messages contain backtick code fences.
- Delayed object-URL revocation after downloads to avoid browser-dependent incomplete exports.

- Added explicit busy-state feedback, delayed report generation until the busy state can render, and disabled conflicting controls while diagnostics work is running.
- Added abort-aware ApplicationV2 lifecycle cleanup, bounded resource timing evidence, and clearer focused/background capture status.
- Expanded regression coverage from 25 to 31 tests.

## 1.0.0 — 2026-07-29

- Game Master-only ApplicationV2 diagnostics dashboard with remembered client window state.
- Bounded, reversible console capture for debug, info, log, warning, and error levels, including focused-session report boundaries.
- Capturing resource-load errors plus browser `error`, `unhandledrejection`, Content Security Policy violation, public Foundry error-hook, and supported long-task evidence capture.
- Cycle-safe, depth-bounded, size-bounded serialization for arbitrary runtime values.
- Best-effort module/system attribution from stack and source paths with explicit non-causality disclaimers.
- Active-module selection, focused capture, all-package capture, ring-buffer metrics, and evidence clearing.
- Package compatibility and relationship checks.
- Manifest asset HTTP status and MIME validation with explicit global and per-asset scan bounds.
- Bounded in-memory JavaScript and CSS review hints without source export.
- Duplicate DOM ID, fixed-position element, and module resource-timing scans.
- In-game guidance for common asset, recursive traversal, ApplicationV2, CSS interference, duplicate registration, dependency mismatch, promise rejection, and long-task problems.
- Optional imported text evidence with a 5 MB per-file limit.
- Selected-only or complete package inventories, privacy redaction, and issue-tracker-ready ZIP reports containing Markdown, JSON, JSONL, scans, guidance, and imported evidence.
- Public module API and module-specific hooks.
- English and German settings/menu localization.
- Node-only tests, build validation, deterministic packaging, pinned CI actions, installable ZIP, reproducible source ZIP, and SHA-256 checksums.
