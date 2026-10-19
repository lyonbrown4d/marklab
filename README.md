# marklab

A desktop Markdown workspace that blends immersive editing with a project graph.

[Website and user guide](https://lyonbrown4d.github.io/marklab/) ·
[Downloads](https://github.com/lyonbrown4d/marklab/releases)

Marklab uses Tauri and Rust for its desktop runtime and native integration, with a
React editor and typed runtime boundary. The former Electron backend and its
packaging dependencies have been removed; historical measurements remain in `docs/performance/`.

## Features

- Markdown editing with block, source, and graph-oriented views.
- Graph view built on React Flow for navigating relationships.
- Tabs, recent projects, and theme switching.
- [Vim mode](docs/vim-mode.md) for source editors, with global and per-tab controls.
- PlantUML previews in `plantuml` / `puml` code fences and standalone
  `.puml`, `.plantuml`, `.pu`, and `.wsd` files.
- Inline and standalone spreadsheet previews for `.xlsx`, `.xlsm`, `.csv`, and
  `.tsv`, with worksheet selection, pagination, resizable columns and cell copying.
- Standalone and embedded Mermaid (`.mmd`, `.mermaid`) and static HTML previews.
- Desktop app targeting Windows, macOS, and Linux.

PlantUML rendering uses the Cargo-managed `puml` library in Rust, without Java or
an additional executable. Standalone files retain the source editor; use the
PlantUML preview button to switch views. Multi-page diagrams include a page selector
and zoom controls. `.iuml` include fragments open as source. Rendering compatibility
follows `puml` rather than the official PlantUML engine; unsupported features may
produce errors or rendering notes. Local-file and URL includes are not enabled.

Spreadsheets use Rust `calamine` / `csv` readers and a virtualized React Data Grid.
Excel previews initially show saved cell values. Select a cell to inspect its
formula; use **Calculate formulas** to calculate supported scalar formulas in Rust
with IronCalc. Supported functions are `SUM`, `AVERAGE`, `MIN`, `MAX`, `COUNT`,
`IF`, `IFERROR` and `ROUND`, including local cross-sheet references. Calculation
is limited to 20,000 cells, 128 formulas and 8 worksheets. Unsupported formulas
produce an error; switching back restores the saved-value preview. Calculation
does not modify the workbook. SheetJS formats visible cell values; dates use ISO
formats, while custom number formats, original styling and charts are not
reproduced. Macros and external data connections are never executed.
Files are limited to 16 MiB with additional
expanded-data and page limits. CSV/TSV retain their source editor and preview the
current buffer. Embed supported files with `![](path/to/file)`.
HTML previews retain inline styles inside a sandboxed frame. Scripts, navigation,
external stylesheets and network resources are disabled. Local images referenced
by relative paths are not loaded; embedded raster data images are supported.

## Tech Stack

- React 19 + Vite + TypeScript
- Tauri 2 + async Rust desktop backend
- Plate, Monaco
- React Flow, Zustand, Radix UI, Tailwind CSS

## Development

Install the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/)
and Rust 1.99.1 or newer. Use Node.js 24 LTS and pnpm 12.11.2 (pinned in
`package.json`) for build tooling; the Tauri app does not embed Node.js.
Dependency build permissions, including `canvas`, are declared in
`pnpm-workspace.yaml` using `allowBuilds`. Newly published packages can be installed
immediately because this project sets `minimumReleaseAge: 0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` opens the official standalone React DevTools and waits for its backend
before starting Tauri. Its blocking development HTML script installs the React hook
before React DOM loads. Closing either launched process stops the other; Ctrl+C
cleans up both process trees. An already-running DevTools backend is reused and
remains open when this development session ends.

Copy `.env.example` to `.env.local` to customize the DevTools port or readiness
timeout. Set `MARKLAB_REACT_DEVTOOLS=false` to start without DevTools. Explicit
process environment variables override dotenv settings. The development runner
adds the local DevTools script/WebSocket origins only to Tauri's `devCsp` override;
production CSP and renderer assets keep their existing configuration. Clients use
127.0.0.1; the upstream standalone server may listen on all network interfaces.
For render profiling, `VITE_REACT_SCAN=false` disables the separate React
Scan overlay. Arguments passed to the development task are forwarded to `tauri dev`.

## Desktop (Tauri)

```bash
pnpm dev:desktop   # same as pnpm dev
pnpm build:desktop # compile release binary, without bundling
pnpm package       # compile and bundle for the host platform
```

See [the Tauri migration and release guide](docs/tauri-migration.md) for native
prerequisites, platform targets, signing configuration, and outstanding acceptance
checks. Automatic updates remain unavailable until the updater key and endpoint
are supplied to the build.

## Command line

On macOS, invoke the executable inside the installed app bundle:

```sh
/Applications/Marklab.app/Contents/MacOS/marklab-desktop --workspace "/path/to/workspace"
/Applications/Marklab.app/Contents/MacOS/marklab-desktop --file "/path/to/note.md"
/Applications/Marklab.app/Contents/MacOS/marklab-desktop "/path/to/workspace" "/path/to/another/note.md"
/Applications/Marklab.app/Contents/MacOS/marklab-desktop --help
```

`-w` and `-f` are aliases for `--workspace` and `--file`. Named targets cannot
be combined with each other or positional targets. Multiple positional paths open
in separate windows. Relative paths use the calling process's working directory;
use `--` before positional paths beginning with a hyphen. The existing `mcp`
subcommand still starts the MCP stdio service before desktop initialization.

When Marklab is already running, the official single-instance plugin forwards
arguments and exits the calling process with code `0` before CLI validation.
Help/version output therefore goes to the running app's console, and invalid
arguments show an error dialog there; the caller's exit code does not report
validation failure. A rejected request does not reopen the previous workspace.

## Quality Gates

See [docs/quality-gates.md](docs/quality-gates.md) for the change impact checklist, ownership
boundaries, and desktop smoke checks used to prevent cross-boundary regressions.

## Website

The Astro website and Starlight user guide are maintained in the independent
`website/` workspace. See [website/README.md](website/README.md) for development
and [docs/website.md](docs/website.md) for deployment boundaries.

## Build

```bash
pnpm build
```
