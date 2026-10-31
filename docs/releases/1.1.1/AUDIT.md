# Runyth Module Diagnostics 1.1.1 — Patch Audit

## Reproduction

A selected package without a `compatibility` object was passed through the v1.1.0 report service and exported. The failure reproduced exactly:

`TypeError: Cannot read properties of undefined (reading 'minimum')`

The originating code was the selected-module table in `issueTrackerMarkdown()`, not the focused-capture implementation.

## Root cause

The diagnostics scanner already handled modern Foundry V13 compatibility metadata defensively. The report formatter had a separate unsafe assumption and directly read nested compatibility fields from the serialized selected-package snapshot. This left a second compatibility failure path outside the scanner.

## Corrective action

- Centralized compatibility display formatting behind a defensive helper.
- Removed direct nested compatibility-field dereferences from report Markdown generation.
- Hardened neighboring report sections so malformed optional substructures cannot abort the whole export.
- Added automated regression and static release gates.

## Foundry API posture

The patch continues using the public Foundry V13 package compatibility and ApplicationV2 APIs and does not add private API access, prototype modification, socket traffic, or persistent console interception.
