# Release Packaging

Marklab uses Vite for the renderer, Electron main, and preload bundles. The
release package step is intended to run after that build and produce desktop
artifacts with `electron-builder`.

## Required Package

Install before using the package scripts:

```sh
pnpm add -D electron-builder
```

`electron-builder` creates the app bundles and installers.

## Scripts

- `pnpm build:desktop`: build `dist` and `dist-electron`.
- `pnpm package`: create an unpacked app directory for local inspection.
- `pnpm dist`: build distributable artifacts for the current host platform.
- `pnpm dist:win`: build Windows `nsis` and `zip` artifacts.
- `pnpm dist:mac`: build macOS `dmg` and `zip` artifacts.
- `pnpm dist:linux`: build Linux `AppImage`, `deb`, and `tar.gz` artifacts.

All packaged artifacts are written to `release/`. Artifact names use:

```text
Marklab-${version}-${os}-${arch}.${ext}
```

## Native Modules

The persisted knowledge/search index is owned by the Rust knowledge-engine
sidecar. The sidecar binary is built by `pnpm knowledge:build:dev` for desktop development and `pnpm knowledge:build` for packaging, then copied into `resources/engine/<platform>-<arch>/`.

`electron-builder` has `npmRebuild` disabled because a full native rebuild also
tries to compile `@homebridge/node-pty-prebuilt-multiarch`, which is intended to
ship prebuilt binaries and should not be forced through a local compiler during
release packaging.

The config also unpacks native module payloads from asar:

- `@homebridge/node-pty-prebuilt-multiarch`

The builder file list includes the app bundles plus the prebuilt terminal
runtime package. This keeps native `.node` binaries loadable at runtime while
avoiding a full production dependency copy.

## Windows Signing

Windows packaging currently sets `win.signAndEditExecutable` to `false`. This
keeps local unpacked builds working without `winCodeSign`, which requires
Windows symlink privileges when its tool archive is extracted.

Before publishing signed Windows artifacts, add a real app icon and code signing
configuration, enable symlink support on the build machine, then remove that
override so Electron Builder can edit executable metadata and sign the app.

## Platform Notes

- Windows builds produce an NSIS installer and a zip archive.
- macOS builds produce a dmg and a zip archive. Signing and notarization are not
  configured yet.
- Linux builds produce AppImage, deb, and tar.gz artifacts.

Cross-platform artifacts should be built on their target OS unless CI provides
the necessary platform toolchain and signing assets.
