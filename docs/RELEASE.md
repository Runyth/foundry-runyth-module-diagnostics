# Release process

1. Update version in `package.json`, `src/module/module.json`, and `CHANGELOG.md`.
2. Confirm compatibility declarations and download URL.
3. Run `npm ci`.
4. Run `npm run check`.
5. Run `npm run check:determinism`.
6. Execute the manual acceptance matrix for the supported Foundry versions.
7. Inspect the `-mod`, `-src`, and `-doc` ZIP structures.
8. Rebuild from a clean extraction of the source ZIP and compare the resulting release artifacts byte-for-byte.
9. Verify SHA-256 checksums.
10. Publish all three ZIPs, checksum file, manifest, changelog, and validation record together.

A release is invalid if the three archives do not represent the same version or if the source archive cannot reproduce the release artifacts.
