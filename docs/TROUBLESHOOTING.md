# Troubleshooting

## The dashboard does not appear

- Confirm the module is active in the current world.
- If you are a player, ask a Game Master to select your Foundry user in the dashboard **Access** tab.
- Open **Configure Settings → Module Settings → Module Diagnostics**.
- Refresh Foundry after first installation if the module was copied while the world was already open.

## A player sees “not enabled for your Foundry user”

A Game Master must open the diagnostics dashboard, choose **Access**, select that Foundry user, and save. Connected clients should synchronize the world setting; if the menu still refuses access, reload that player's Foundry browser.

## Earlier console messages are missing

This is expected. Browser JavaScript cannot request historical DevTools console entries. Background browser/runtime error listeners begin when an authorized client initializes the module, but console methods are intentionally intercepted only during focused capture. Start focused capture immediately before reproducing an issue.

## Server errors are missing

Client modules cannot read the Foundry server's filesystem. Export or copy the relevant server-log excerpt to a text file and import it from the Report tab.

## Attribution says “Unattributed”

The available message, stack, source URL, and location did not include a recognizable `/modules/<id>/` or `/systems/<id>/` path. Keep unattributed entries enabled during focused reproduction, and attach the complete stack when available.

## A scan flags valid code

Static scans are intentionally conservative. They cannot determine execution context or reachability. Review the matched excerpt and surrounding source; do not report a defect based on a heuristic match alone.

## Asset scan fails for a working module

Check whether the asset is cross-origin, generated dynamically, protected by authentication, larger than 2 MB, or declared in a structure this release does not normalize. The report records the request outcome rather than silently treating it as proof of a packaging defect.

## The report still contains private data

Add the exact value on a separate line under **Additional exact terms to redact**, export again, and manually inspect every attachment. Do not upload a report until privacy review is complete.

## Asset scan reports paths containing `modules/<id>/modules/<id>/`

That pattern was a v1.0.0–v1.0.1 scanner defect. Upgrade to v1.0.2 or newer. V13 package instances can expose already-rooted paths; current releases canonicalize both rooted and manifest-relative forms before requesting them.

## A scan fails while reading `minimum` compatibility data

Upgrade to v1.0.2 or newer. The scanner now reads the modern package `compatibility` object defensively and does not fall back through legacy pre-V10 core-version fields. Malformed third-party package metadata is isolated instead of crashing the entire scan.

## Report export fails with `Cannot read properties of undefined (reading 'minimum')`

Upgrade to v1.1.1 or newer. Versions through v1.1.0 formatted selected-package compatibility metadata with a direct nested property access while building `issue-report.md`. A package snapshot with missing or malformed compatibility metadata could therefore abort the dashboard action even though focused capture itself started or stopped correctly.

v1.1.1 treats compatibility metadata as optional during report formatting and renders unavailable bounds as `—`. Focused capture state does not control this failure, so stopping capture was never expected to clear it.
