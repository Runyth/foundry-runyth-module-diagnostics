# runyth-module-diagnostics-1.0.2

## Patch release

Released 2026-08-09.

### Scope

This patch resolves defects observed in the supplied Foundry browser-console log and adds stable in-page progress reporting for diagnostics scans.

### User-visible changes

- The Scans page always reserves one compact progress panel below the scan header. Starting, advancing, completing, or stopping a scan does not add or remove layout rows.
- The panel shows the active stage, current module/asset or scan detail, and a percentage. Complete-suite progress is weighted by expected scan cost.
- Asset scans accept both raw manifest-relative asset names and V13 package-instance paths already rooted below `modules/<id>/`.
- Compatibility scanning no longer touches legacy pre-V10 core-version fallback fields.
- Background diagnostics no longer permanently wraps browser console functions. Explicit focused capture wraps only requested levels and restores them afterward.
- Scan completion no longer emits repeated informational notifications.

### Attached-log defects addressed

The supplied log showed hundreds of requests containing duplicated roots such as `modules/dae/modules/dae/dae.js`, repeated `Cannot read properties of undefined (reading 'minimum')` exceptions, repeated diagnostics completion output, and console call-site distortion through `capture-service.js`. All four failure classes are covered by this patch and regression tests.
