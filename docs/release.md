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

Workspace knowledge and search run in the bundled Node.js utility-process
entry. There is no native knowledge-engine binary, Cargo build, or
`resources/engine` packaging step.

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

Signed Windows releases use a certificate installed in the local user's Windows
certificate store. CI remains unsigned and does not receive signing credentials.

The certificate must be in `Cert:\CurrentUser\My` or
`Cert:\LocalMachine\My`, be currently valid, include an accessible private key,
and include the Code Signing EKU (`1.3.6.1.5.5.7.3.3`). List suitable
certificates and copy the thumbprint:

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
  Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
Get-ChildItem Cert:\LocalMachine\My -CodeSigningCert |
  Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
```

Set the thumbprint for the current shell and run the local signed package task:

```powershell
$env:MARKLAB_WINDOWS_CERTIFICATE_SHA1 = '<certificate-thumbprint>'
pnpm dist:win:signed
```

The task validates the certificate before building, requires Electron Builder to
sign, uses SHA-256 with an RFC 3161 timestamp, then verifies both the NSIS setup
executable and `release/win-unpacked/Marklab.exe` with SignTool and
`Get-AuthenticodeSignature`. Missing, expired, invalid, unsigned, or
non-timestamped artifacts fail the task. A Windows SDK installation providing
`signtool.exe` is required for verification; the script can also use Electron
Builder's cached x64 SignTool.

Normal `pnpm dist:win` builds remain unsigned for development. Private-key
containers (`*.pfx` and `*.p12`) are ignored by Git even though this workflow
does not read them directly.

## Platform Notes

- Windows builds produce an NSIS installer and a zip archive.
- macOS builds produce a dmg and a zip archive. Signing and notarization are not
  configured yet.
- Linux builds produce AppImage, deb, and tar.gz artifacts.

Cross-platform artifacts should be built on their target OS unless CI provides
the necessary platform toolchain and signing assets.
