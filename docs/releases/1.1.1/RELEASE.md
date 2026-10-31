# Runyth Module Diagnostics 1.1.1

## Patch scope

Version 1.1.1 fixes the repeated dashboard action failure reported after focused capture begins:

`Cannot read properties of undefined (reading 'minimum')`

The failure was reproduced in v1.1.0 inside issue-tracker Markdown generation. Report formatting directly dereferenced `pkg.compatibility.minimum`, `maximum`, and `verified`. If a selected package snapshot did not contain a usable compatibility object, report ZIP generation threw and the ApplicationV2 action handler surfaced the exception.

Focused capture itself was not the source of the error. Stopping focused capture therefore did not remove the condition.

## Resolution

- Package compatibility metadata is treated as optional while formatting reports.
- Missing or malformed compatibility values render as `—`.
- The Markdown formatter now tolerates partial environment, evidence, guidance, scan, and package structures.
- No compatibility range is inferred when a package does not provide one.
- The existing bounded capture, player authorization, scan progress, redaction, and ApplicationV2 lifecycle behavior is unchanged.
