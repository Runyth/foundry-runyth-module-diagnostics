# Runyth Module Diagnostics 1.1.0

## Feature release

Version 1.1.0 adds GM-managed player diagnostics access. A Game Master can select non-GM Foundry users in the dashboard's **Access** tab. An authorized player then runs diagnostics in their own browser and explicitly exports a ZIP to send to the GM or attach to an issue report.

## Key behavior

- GM access is permanent.
- Player access is opt-in per Foundry user.
- Authorization is world-scoped; diagnostic evidence remains browser-local.
- Players receive capture, scans, guidance, evidence import, and report export.
- Players never receive the Access tab or access-administration API methods.
- Revocation closes the player's dashboard and tears down that client's diagnostics services.
- No sockets, telemetry, automatic upload, or shared evidence storage are introduced.

## Compatibility

- Foundry minimum: 13
- Manifest verified: 13.351
- Declared maximum: 14
- Game system: system-agnostic

## Upgrade

Replace the complete previous module directory with the 1.1.0 installation ZIP, restart Foundry, enable the module, then open **Module Diagnostics → Access** as a Game Master and select any player users who should be permitted to collect client diagnostics.

Existing client settings and the normal GM workflow require no migration. The new world allow list defaults to empty, so no player gains access automatically after upgrade.
