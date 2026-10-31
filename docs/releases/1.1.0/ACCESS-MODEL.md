# Runyth Module Diagnostics 1.1.0 — Player Access Model

## Objective

Allow selected non-GM Foundry users to collect evidence from their own browser client and explicitly export a diagnostics ZIP for the Game Master, without creating a shared evidence store or granting any Game Master capability.

## Authorization

- Game Masters are always authorized.
- The hidden world setting `runyth-module-diagnostics.playerAccess` stores an object containing `allowedUserIds`.
- Only current non-GM Foundry user IDs are accepted when the list is saved.
- Unknown, stale, blank, duplicate, and GM user IDs are discarded by normalization/sanitization.
- An unauthorized client cannot initialize diagnostics services or open the dashboard.

## Player capability

An authorized player may use the same client-local diagnostics workflow needed to reproduce a browser problem:

- select active modules;
- start/stop focused evidence capture;
- collect supported browser/runtime error evidence;
- run bounded compatibility/interference scans;
- inspect built-in troubleshooting guidance;
- import their own text/log evidence;
- create and export their own redacted report ZIP.

The player does not receive the Access tab or access-administration API methods.

## Evidence isolation

Evidence is not synchronized through Foundry settings, flags, Documents, sockets, or a remote service. Every browser creates its own `CaptureService`, `DiagnosticsService`, and `ReportService` instance. The evidence ring buffer, imported files, focused sessions, and generated report data live only in that browser page's memory until explicitly downloaded.

The world setting contains authorization IDs only. It contains no diagnostic evidence.

## Revocation

When an access-setting change reaches an unauthorized client, the module:

1. closes an open diagnostics dashboard;
2. aborts dashboard-owned work through the existing ApplicationV2 close lifecycle;
3. uninstalls browser/runtime capture listeners and observers;
4. restores any temporary focused-console wrappers;
5. discards all diagnostics service references and their in-memory evidence;
6. replaces the public module API with the minimal authorization/open facade.

Re-granting access creates a fresh client-local diagnostics service instance.

## User interface

The GM-only Access tab uses a searchable, scrollable, aligned list of non-GM Foundry users. Each row includes the display name, stable Foundry user ID, current active/online state, and one checkbox. Bulk allow/deny controls modify the pending selection only; **Save player access** performs the world-setting update explicitly.

The player-facing Capture page includes a concise notice explaining that evidence remains in that browser until the player deliberately exports and sends the ZIP.

## Threat boundary

This access model is an operational permission and privacy boundary for normal Foundry use. Foundry modules execute client-side JavaScript; it is not a security boundary against a deliberately adversarial user modifying loaded code in browser developer tools. No real-world secret should be stored in module authorization metadata.
