# Runyth Module Diagnostics 1.1.0 — Feature and Compatibility Audit

## Baseline

Version 1.0.2 is the implementation baseline. The feature release preserves its V13 package-path normalization, modern compatibility metadata handling, bounded/cancellable scans, layout-stable progress UI, focused-only console interception, privacy redaction, and deterministic report packaging.

## Access implementation review

- Player authorization is represented by one hidden world-scoped setting.
- Game Masters are unconditionally authorized.
- Only non-GM users can be persisted in the allow list.
- Dashboard opening performs a runtime authorization check rather than trusting menu visibility.
- The settings-menu launcher is available to non-GM clients because Foundry's menu-level `restricted` flag cannot represent an arbitrary per-user allow list; unauthorized clients are rejected by the runtime guard.
- The GM-only Access tab is omitted from non-GM render context/navigation and action handling rejects non-GM navigation attempts.
- Checkbox mutation and persistence are independently GM guarded.
- Player API objects omit access-administration methods.
- Unauthorized API objects contain only version, authorization introspection, and guarded open functionality.

## Client isolation review

- No new socket usage was introduced.
- No shared evidence setting, User flag, world Document, or server upload path was introduced.
- Revocation tears down capture before service references are dropped.
- Temporary console wrappers are restored through `CaptureService.uninstall()`.
- Long-task observers and browser listeners are disconnected/removed during teardown.
- Existing ApplicationV2 close cancellation remains responsible for aborting active dashboard work.

## Foundry V13/API review

- Dashboard remains ApplicationV2 + HandlebarsApplicationMixin.
- The access selector uses public `game.users`, `User.isGM`, `User.active`, and `game.settings` data.
- No ApplicationV1/FormApplication implementation was added.
- No generic render hooks, sheet hooks, HUD/canvas integrations, prototype patches, private Foundry fields, or module sockets were added.
- Existing Foundry V13 package compatibility scanning continues to avoid deprecated legacy compatibility getters.

## UI/UX review

- Access UI is contained in the module-owned dashboard root and scoped CSS.
- Player rows use a stable three-column grid at ordinary widths and a two-row compact layout at narrow widths.
- The list is vertically bounded and scrollable for large worlds.
- Names and IDs can wrap without forcing horizontal overflow.
- Search filters rows in place without rebuilding the ApplicationV2 window on every keystroke.
- Selection changes update counts in place; bulk controls and Save use normal rerenders.
- All access controls have text labels and the checkbox row itself is clickable.
- Access changes use an explicit Save action to avoid accidental immediate permission changes.

## Privacy review

- The authorization setting contains Foundry user IDs only.
- It contains no capture events, imported files, scans, report input, or redaction values.
- Player reports retain the same privacy warning and explicit export requirement as GM reports.
- Evidence remains ephemeral and local to the browser page.

## Remaining runtime qualification

No live Foundry VTT client is available in the build environment. Static/unit qualification does not replace a GM + two-player manual test in the intended Foundry V13 world. Use `docs/MANUAL-TESTS.md` before campaign reliance.
