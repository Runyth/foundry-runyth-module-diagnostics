# Compatibility policy

## Supported baseline

- Minimum Foundry VTT: 13
- Verified manifest version: 13.351
- Declared maximum: 14
- Game systems: system-agnostic
- Client role: Game Masters plus explicitly authorized non-GM users

The module is written against public Foundry APIs and standard browser APIs. Compatibility declarations are reviewed for every release.

## Access policy

- Game Masters are always authorized.
- A hidden world setting stores the selected non-GM user IDs.
- Authorized players receive client-local diagnostics capabilities only; the Access tab and access mutation API remain GM-only.
- Authorization changes do not transmit evidence and do not require module sockets.

## Integration policy

Runyth Module Diagnostics does not contain hard dependencies or direct integrations with third-party modules. It reads public package metadata and declared asset paths. Optional package APIs are not assumed.

## Non-interference policy

A release must not:

- patch prototypes or replace Foundry functions;
- access private fields or private hook registries;
- add generic render hooks;
- add controls to sheets, dialogs, chat, token HUD, scene controls, canvas, or pop-out windows;
- use sockets or transmit evidence;
- run package source scans automatically;
- traverse live Foundry documents recursively;
- export fetched third-party source code.

## Forward compatibility

Foundry 14 support is declared as a forward target, not a substitute for live acceptance testing. Before publishing a compatibility-only update, run the manual matrix in `MANUAL-TESTS.md` against the supported stable release(s).

## Application lifecycle safeguards

- Long-running asset/source scans accept an AbortSignal and are cancelled when the dashboard closes.
- Aborted operations do not publish partial scan results or re-render a closed application.
- Window-state persistence is best-effort and never blocks ApplicationV2 closure.
- Report downloads retain their object URL briefly after the click to support browser download handoff.

## Foundry V13 package metadata safeguards

- Compatibility scanning reads `compatibility.minimum`, `compatibility.verified`, and `compatibility.maximum` and does not traverse deprecated core-version compatibility shims.
- Declared module assets accept both raw manifest-relative paths and V13 package-instance paths already rooted beneath `modules/<id>/`.
- Supported-system relationship entries without an explicit package type are interpreted as system relationships.
