# Desktop and CLI releases

## Standalone CLI on crates.io

The standalone `marklab-cli` package installs the `marklab` command. Its shared
`marklab-document` dependency is published separately; neither package requires
the desktop runtime. Both crates are licensed under `MIT OR Apache-2.0`.

Use Rust 1.99.1 or newer. From a clean repository checkout, keep both crate
versions and the CLI's exact `marklab-document` dependency version aligned, then:

```bash
pnpm cli:test
pnpm cli:publish:check
cargo login
pnpm cli:publish
```

`cli:publish:check` packages and builds both crates without uploading. The CLI
workflow runs this check on Linux after the existing tests. `cli:publish` uploads
the library before the CLI using Cargo's workspace publication ordering. It
selects only these two crates; do not publish the entire desktop workspace.
Cargo credentials must have permission to publish both package names. Keep
tokens out of Git, command arguments, and logs; `cargo login` prompts for one.
Published versions cannot be overwritten, so fixes require a new version.

If Cargo reports that the library was uploaded but times out waiting for its
registry index entry, verify its version on crates.io and wait for the index to
become available. Do not upload that library version again. Once Cargo can
resolve it, resume only the unpublished CLI:

```bash
cargo publish -p marklab-cli --locked
```

After publishing, verify installation outside the checkout:

```bash
cargo install marklab-cli --version 0.2.8 --locked
marklab --version
marklab --help
```

The separate `cli-v<version>` tag still creates draft GitHub releases with
prebuilt binaries and checksums. It does not upload to crates.io; registry
publication is an explicit maintainer action.

## Desktop runtime

The runtime and bundler use Tauri 3 alpha. Windows uses Wry/WebView2; macOS
and Linux ship CEF. Node.js and pnpm are build tools;
Electron, its Node backend, and its packaging commands have been removed.
See [Tauri configuration and credentials](tauri-migration.md) for the complete
platform and updater configuration.

## Build and artifact paths

```bash
pnpm build:desktop # host release; runnable app on macOS, no installers
pnpm package       # build, then bundle for the host
pnpm dist:mac      # macOS ARM app/dmg
pnpm dist:win      # Windows x64 NSIS/MSI
pnpm dist:linux    # Linux x64 AppImage/deb
pnpm dist:flatpak --deb <path/to/Marklab_0.2.8_amd64.deb> # Linux x64 Flatpak
```

Build on the target OS. macOS needs CMake and Ninja. Linux needs GTK 4.12 or
newer; native CI uses Ubuntu 24.04 and GTK4 instead of WebKitGTK. CEF downloads
about 1 GB on its first build into the shared user cache (`CEF_PATH` can select
an existing distribution). For direct Cargo checks/tests, set `CEF_PATH` to the
same cache directory; the Tauri CLI, `pnpm tauri:check` / `pnpm tauri:test`, binding generator and CI
use that shared path. Linux native windows use X11; Wayland sessions require
XWayland and a valid `DISPLAY`.
See the [CEF requirements](https://v3.tauri.app/develop/cef/). Host builds
use `src-tauri/target/release/`; target-specific builds use
`src-tauri/target/<target>/release/`. Installers live below `bundle/`. The native
executable is `marklab-desktop` (`marklab-desktop.exe` on Windows). On macOS,
launch `bundle/macos/Marklab.app/Contents/MacOS/marklab-desktop`; CEF needs the
framework and helper apps in that bundle. Both the build helper and Tauri dev
create the required app. macOS signing covers the CEF framework/helpers and
uses the Chromium entitlements supplied by the Tauri bundler. Windows keeps
WebView2 installation; CEF is included only on macOS/Linux.

The runtime migration requires fresh startup, memory, native E2E, installer,
code-signature and updater acceptance on each platform. Earlier Tauri 2/WebKit
results are historical evidence, not Tauri 3 acceptance.

## Flatpak (Linux x86_64)

Install `flatpak` and `dpkg-deb` (Debian package extraction) using your distribution's
package manager, then install the
packaging runtime and Zypak BaseApp once:

```bash
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
flatpak install --user flathub org.gnome.Platform//50
flatpak install --user --no-deps flathub org.electronjs.Electron2.BaseApp//25.08
pnpm dist:linux
pnpm dist:flatpak --deb src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/deb/Marklab_0.2.8_amd64.deb
```

For a host build without an explicit Rust target, use the deb below
`src-tauri/target/release/bundle/deb/` instead. The script checks the package name,
version, architecture, CEF files, and dynamic libraries against the actual GNOME
Platform before exporting `release/flatpak/Marklab_<version>_x86_64.flatpak`.
No SDK is needed for this binary repack. GNOME 50 and BaseApp 25.08 share the
Freedesktop 25.08 base; GNOME supplies GTK4 and BaseApp supplies Zypak. This does
not introduce Electron into Marklab. Existing Windows and macOS builds are unchanged.
For a clean native release build, `pnpm bindings:generate --release` generates the
same IPC contract while sharing the release dependency cache with the app build.

```bash
flatpak install --user ./release/flatpak/Marklab_0.2.8_x86_64.flatpak
flatpak run app.marklab.tauri.desktop
flatpak run app.marklab.tauri.desktop --workspace "$HOME/Projects/spec"
```

The Flatpak uses its own application data under
`~/.var/app/app.marklab.tauri.desktop/`; it does not migrate or overwrite the deb's
settings. Home access supports workspace folders and relative document links.
It also uses a separate single-instance identity so activation does not select
the installed deb. Repeat launches are forwarded before CEF opens its profile.
For a workspace outside home, grant its directory explicitly, for example:
`flatpak override --user --filesystem=/mnt/notes app.marklab.tauri.desktop`.
X11/XWayland, GPU, audio, network and the Hyprland runtime socket
are exposed for existing desktop features. Zypak's CEF support preserves Chromium
process isolation through Flatpak's spawn portal; the launcher never disables the
browser sandbox. See [Zypak's CEF support](https://github.com/refi64/zypak#cef-support).

On Hyprland, Flatpak's minimize action hides the current window to avoid GTK
reasserting a tiled window's maximized state. Launch Marklab again to activate
the existing hidden window. Maximization and restoration target the current
native owner through X11 and use the compositor's state for the button icon.
Other desktops and non-Flatpak builds retain their existing native controls.

The integrated terminal and executable AI/MCP providers run inside the Flatpak:
host-installed commands and host shell configuration are not automatically
available. Use tools installed in the sandbox or the deb for host tool integration.
Updates are distributed as replacement Flatpak bundles (`flatpak install --user
./Marklab_<version>_x86_64.flatpak`), not as Tauri installers. The build uses the
deb as its source artifact; it is not a source-build submission to Flathub. Flathub
publication, repository signing and an update repository are separate release work.
The Linux release job attaches the bundle to the existing draft GitHub release.

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
