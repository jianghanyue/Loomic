# Loomic Desktop Release Flow

Phase 2 packages the existing static web export as a signed Electron app for
macOS, Windows, and Linux. The API, worker, Supabase credentials, database, and
AI keys remain outside the desktop artifact.

## Local builds

Run one of the platform-specific commands from the repository root:

```bash
pnpm --filter @loomic/desktop package:mac
pnpm --filter @loomic/desktop package:win
pnpm --filter @loomic/desktop package:linux
```

Each command runs the web export, stages it in `apps/desktop/renderer/`, builds
the Electron main process and preload scripts, then writes installers and
`latest*.yml` metadata to `apps/desktop/release/`.

## CI workflows

- `desktop-build.yml` runs platform packaging on pull requests and changes to
  `main`. It never publishes a release.
- `desktop-release.yml` runs on `v*` tags or a manually supplied version. Native
  macOS, Windows, and Linux jobs build in parallel, upload their artifacts, and
  a final Ubuntu job creates a draft GitHub release with all installers and
  update manifests.

The release workflow resolves `v1.2.3` to `1.2.3` and updates
`apps/desktop/package.json` with `scripts/set-version.mjs` before packaging.

## Signing secrets

Add the following repository secrets before enabling a production release:

- `CSC_LINK` and `CSC_KEY_PASSWORD` for the macOS signing identity (and as the
  default Windows certificate when `WIN_CSC_LINK` is not supplied).
- `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` for a Windows code-signing PFX.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for Apple
  notarization.

The workflow intentionally creates a draft release. After checking the
artifacts and release notes, publish it in GitHub; packaged clients will then
discover the matching `latest*.yml` feed through `electron-updater`.

## Update feed override

The default provider is GitHub Releases (`caokaijun2005-arch/Loomic`). Set
`LOOMIC_UPDATE_URL` in the packaged app's launch environment only when using a
generic HTTPS feed. The runtime checks are disabled for unpackaged development
runs.
