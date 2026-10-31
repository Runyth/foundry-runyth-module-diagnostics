# Manual acceptance test matrix

Perform these tests in a disposable world. Record Foundry version, system/version, browser/version, and active module set.

## Installation and lifecycle

1. Extract the install ZIP directly into `Data/modules/` and verify one `runyth-module-diagnostics` directory exists.
2. Enable the module as GM and confirm no missing JS/CSS/template/language requests appear.
3. Join as an unselected non-GM user and confirm the Module Diagnostics menu refuses access, the full API is absent, and no diagnostics listeners/observers or console wrappers are installed.
4. As GM, open **Access**, select that player, save, and confirm the connected player can open the dashboard. Verify their evidence list starts independently from the GM client and their window state is independent.
5. Revoke the same player while their dashboard is open. Confirm the window closes, focused console wrappers are restored, diagnostics listeners/observers are removed, and reopening is refused. Re-grant access and confirm a fresh client-local service instance starts without the previous in-memory evidence.
6. Confirm a player cannot reveal the Access tab through ordinary navigation and that the GM-only access-administration API methods are absent from the player API object.
7. Open, move, resize, close, and reopen the dashboard; verify position and size are retained for that client.
8. Open the settings menu repeatedly and verify only one diagnostics window remains usable.
9. Start an asset scan, close the dashboard before it completes, and verify the scan is cancelled without reopening the window or publishing a partial result.
10. Resize the window below 850 px and 620 px; verify report fields, tabs, button labels, imported filenames, and log text remain usable without horizontal clipping.

## Capture

1. Confirm `console.debug`, `console.info`, `console.log`, `console.warn`, and `console.error` functions remain unchanged while only background capture is active.
2. Confirm `window.error`, failed-resource, `unhandledrejection`, CSP, Foundry error-hook, and enabled long-task evidence can be retained without permanent console interception.
3. Start selected capture for one module and verify only requested console levels are temporarily wrapped. Trigger evidence with its `/modules/<id>/` path; verify attribution and inclusion.
4. Trigger an event from another module path and confirm it is excluded from the focused session even when background runtime-error capture remains enabled.
5. Toggle unattributed inclusion and confirm behavior for errors without package paths.
6. Reduce the buffer limit, exceed it, and verify oldest-entry discard accounting.
7. Clear capture and verify both entries and discard count return to zero.
8. Verify the most recent focused session can be selected as the report boundary.
9. Disable the module, refresh, and verify normal console behavior remains intact.

## Scans

1. Run relationship scan with a module declaring a missing requirement.
2. Run asset scan against one package exposing manifest-relative asset paths and one exposing already-rooted `modules/<id>/...` paths. Verify neither request duplicates the package root; then use a deliberately incorrect JS/CSS path and verify HTTP/MIME findings.
3. Run source scan against fixtures containing a legacy Application reference, global DOM query, prototype assignment, and custom deepFreeze.
4. Run CSS scan against scoped and unscoped fixtures and review false-positive wording.
5. Render duplicate IDs and fixed elements, run DOM scan, then remove them and rescan.
6. Run resource timing scan after loading module assets.
7. While each scan is running, verify the reserved progress region does not alter surrounding layout, percentage never decreases, stage/detail text remains readable, and the complete-suite scan reaches exactly 100%.
8. Resize the dashboard during a scan and verify the progress bar remains aligned without overflowing buttons or adjacent cards.
9. Confirm scan completion does not emit repeated informational notifications into the browser console.
10. Confirm fetched source text is absent from report JSON and scan JSON.
11. Exercise package metadata whose legacy `minimumCoreVersion`/`compatibleCoreVersion`/`maximumCoreVersion` getters throw and verify relationship scanning still completes from the modern `compatibility` object.

## Reports and privacy

1. Add reproduction details, import a small text log, and export a ZIP.
2. Export once with selected-only package inventory and once with complete installed inventory.
3. Verify `issue-report.md`, `report.json`, `evidence.jsonl`, `known-issues.md`, `scans/`, and `imported/` contents.
4. Import two files whose names sanitize to the same filename and verify both remain listed with deterministic suffixes.
5. Attempt an import larger than 5 MB and verify rejection.
6. Include bearer tokens, API keys, password assignments, credential query parameters, hosts, IPv4/IPv6 values, and a custom term; verify redaction.
7. Include a captured message containing triple backticks and verify `issue-report.md` remains valid Markdown.
8. Inspect the full ZIP manually for private values before external upload.

## Interference regression matrix

With representative modules active, verify that diagnostics adds nothing to:

- Actor and Item sheets, including Tidy 5e sheets;
- advancement/level-up dialogs;
- chat messages and roll cards;
- token HUD and canvas controls;
- scene, actor, item, journal, and compendium directories;
- settings applications other than its own menu entry;
- pop-out windows;
- keyboard shortcuts;
- module socket traffic.

## Foundry versions

Run the complete matrix on Foundry 13.351. Before claiming Foundry 14 verification, repeat it on the supported Foundry 14 stable release and update `module.json` plus release documentation.
