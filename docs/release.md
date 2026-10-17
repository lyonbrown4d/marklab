# Tauri Desktop Packaging

The current runtime and bundler are Tauri 2. Node.js and pnpm are build tools;
Electron, its Node backend, and its packaging commands have been removed.
See [Tauri configuration and credentials](tauri-migration.md) for the complete
platform and updater configuration.

## Build and artifact paths

```bash
pnpm build:desktop # host release executable, without installers
pnpm package       # build, then bundle for the host
pnpm dist:mac      # macOS ARM app/dmg
pnpm dist:win      # Windows x64 NSIS/MSI
pnpm dist:linux    # Linux x64 AppImage/deb
```

Install the Tauri platform prerequisites and build on the target OS. Host builds
use `src-tauri/target/release/`; target-specific builds use
`src-tauri/target/<target>/release/`. Installers live below `bundle/`. The native
executable is `marklab-desktop` (`marklab-desktop.exe` on Windows).

## Release workflow

The release workflow validates the repository and matching package/Tauri/Cargo
versions, runs the renderer coverage and Chromium smoke checks, then builds on
Linux x64, macOS ARM, and Windows x64. Each native job runs formatting, strict
Clippy and library tests before the official Tauri action uploads artifacts to a
draft release. Publication remains a separate review step.

Updater private/public keys are required by the release preparation script.
macOS additionally requires the configured Developer ID and notarization
credentials. The script writes only public updater configuration to a temporary
file. Source builds have no updater public key or endpoint and report updates
unavailable until configured. An updater signature does not establish an OS code
signature or prove that installation/update acceptance has been performed.

GitHub Actions is currently unavailable because the account is disabled. Workflow
configuration is retained, but there is no successful hosted result for the
current cleanup; local evidence and remaining platform checks must be reviewed.

## Windows Authenticode

Windows Authenticode signing is not configured. Existing Windows builds must not
be described as signed because Tauri updater signing is enabled. Configuring a
certificate and SHA-256 signing with RFC 3161 timestamping is a separate release
prerequisite.

A verifier is available for a future signed build:

```powershell
./scripts/verify-windows-signatures.ps1 -ReleaseDirectory ./src-tauri/target/x86_64-pc-windows-msvc/release
```

It locates SignTool only in the Windows SDK, requires the native executable and
at least one NSIS/MSI installer, rejects ambiguous stale installer sets, and
checks every artifact with SignTool and `Get-AuthenticodeSignature`. Unsigned,
invalid or non-timestamped artifacts fail. This script does not sign files and
has not been executed on Windows as part of the current cleanup. Private-key
containers remain excluded from version control.
