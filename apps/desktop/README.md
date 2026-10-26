# Loomic Desktop MVP

The desktop MVP is an Electron shell around the existing static Next.js export.
It connects to the existing Fastify API and WebSocket server; it does not bundle
the API, Worker, Supabase service credentials, database credentials, or AI keys.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter @loomic/desktop dev
```

The command builds `apps/web/out`, compiles the Electron main process and
preload, then opens the desktop window. The API URL is read at runtime from
`LOOMIC_DESKTOP_API_URL`, falling back to `NEXT_PUBLIC_SERVER_BASE_URL` and then
`http://localhost:3001`.

For Google OAuth, add `loomic://auth/callback` to the Supabase project's allowed
redirect URLs. The API must allow the `app://loomic` Origin; the server now
includes it by default and accepts additional comma-separated origins through
`LOOMIC_ALLOWED_ORIGINS`.

## Packaging

The packaging scripts build the static web export, copy it into the desktop
bundle, compile the Electron main process, and run `electron-builder`:

```bash
pnpm --filter @loomic/desktop package:mac
pnpm --filter @loomic/desktop package:win
pnpm --filter @loomic/desktop package:linux
```

Installers and update metadata are written to `apps/desktop/release/` (DMG on
macOS, NSIS on Windows, and AppImage plus deb on Linux). The renderer staging
directory is `apps/desktop/renderer/` and is ignored by Git.

Use the version helper before a local release:

```bash
pnpm --filter @loomic/desktop set-version -- 1.2.3
```

## Signing and release

`.github/workflows/desktop-build.yml` packages all three platforms for pull
requests and pushes to `main`. `.github/workflows/desktop-release.yml` builds
the signed artifacts on native runners for a `v*` tag (or a manually supplied
version), then creates a draft GitHub release and uploads the installers and
`latest*.yml` update manifests.

Configure these repository secrets for signed releases:

| Secret | Used by | Purpose |
| --- | --- | --- |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS/Windows | Base64 or URL encoded signing certificate and password |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows | Optional Windows-specific certificate override |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS | Notarization credentials |

GitHub publishing uses the workflow's `GITHUB_TOKEN`. A release is left as a
draft so it can be reviewed before it becomes visible to users.

## Updates

Packaged apps use the GitHub provider declared in `electron-builder.yml`, which
reads the uploaded `latest*.yml` manifests. Set `LOOMIC_UPDATE_URL` in the
packaged app's launch environment only when serving the manifests from a
generic HTTPS update feed instead. The main process checks for updates after
startup, exposes status to the renderer, and supports download/install from
the native Help menu or the in-app update notice. Development runs
intentionally disable update checks.
