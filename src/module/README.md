# Runyth Module Diagnostics

A Foundry VTT 13–14 diagnostics module for Game Masters and explicitly authorized player users for bounded browser evidence capture, module selection, compatibility and interference scans, privacy-aware report generation, and issue-tracker-ready ZIP exports.

## Open the dashboard

Open **Game Settings → Configure Settings → Module Settings → Module Diagnostics**. Game Masters can use the **Access** tab to select non-GM users who may run diagnostics from their own browser.

Recommended workflow:

1. Select the suspected active modules.
2. Start focused capture immediately before reproducing the problem.
3. Reproduce the smallest exact failure and stop capture; the session remains available as an export boundary.
4. Run relevant scans.
5. Choose selected-only or complete package inventory, add reproduction details and optional imported server/console log excerpts.
6. Add exact private values to the redaction list.
7. Export the ZIP, review every file, and attach it to the issue tracker.

## Boundaries

- Previous browser-console history cannot be recovered.
- Server logs must be imported manually.
- Attribution and static findings are diagnostic leads, not proof of root cause.
- Fetched third-party source is never included in reports.
- Automatic redaction requires a final human privacy review.

The module does not use sockets, telemetry, prototype patches, scene controls, sheet controls, token HUD controls, generic render hooks, or private Foundry APIs.

## Access model

Game Masters are always authorized. Selected players receive the same capture, scan, guidance, import, and report workflow on their own client, but cannot edit the GM-controlled access list. No evidence is sent to the GM automatically; the player explicitly exports and sends the report ZIP.

## Recent hardening

Version 1.0.2 added a layout-stable informative scan progress bar, Foundry V13 package-path normalization, defensive modern compatibility metadata handling, focused-only console interception, and quieter scan completion behavior. Version 1.1.0 added per-player diagnostics authorization without introducing sockets or shared evidence storage. Version 1.1.1 hardens report export against missing or malformed package compatibility metadata.
