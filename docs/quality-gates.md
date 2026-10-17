# Quality Gates

Marklab uses a React renderer and a Tauri/Rust desktop backend. Check the boundary
that changed, and keep browser, native-library, and actual desktop evidence separate.

## Ownership Boundaries

- Rust owns native windows, menus, dialogs, filesystem access, app identity,
  deep links, indexing, SQLite persistence, Git, PTY, sync, and packaging.
- `src/services/*` and the typed `src/runtime/*` adapter own desktop calls and
  scoped event subscriptions. Commands validate requests and root ownership;
  external child webviews have no desktop capability.
- Monaco owns source editing; Plate owns rich editing; React Flow owns graph
  interaction and layout. Native edit routing respects actual focus and Vim ownership.
- Zustand owns renderer preferences. Rust's settings allowlist and per-window
  session rules control persistence.
- Node.js is build/test tooling. The former Electron runtime, preload, Node
  knowledge sidecar, and dedicated packaging/test entry points have been removed.

## Change Impact Checklist

Use the shared impact rules to select focused checks:

```bash
pnpm quality:impact
pnpm quality:impact --staged
pnpm quality:impact --base origin/main
pnpm quality:line-limits
pnpm test:coverage:critical
pnpm check
```

`pnpm check` runs impact reporting, source line limits, lint, typecheck, and the
frontend coverage gate. Human-maintained TypeScript and Rust files must stay
within 300 non-blank effective lines, including root-level tooling and configuration files.
Downloaded shadcn source remains intact and is extended through composition.

Coverage remains **85 percent independently for lines, functions, statements,
and branches in every selected file**. The original 16 retained editor/worker
files remain selected; six current runtime, renderer lifecycle/frame, and Tauri
adapter files replace the nine removed backend files. Native Rust behavior is
covered by its own real service tests, rather than counted as frontend coverage.

| Impact area                      | Common risk                                                    | Required checks                                                                |
| -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Tauri native runtime             | workspace isolation, unsafe IPC, lifecycle or cache drift      | Rust checks and affected native acceptance                                     |
| Native menus / windows           | double dispatch, focus, close/quit or splash races             | native lifecycle/menu and focused edit tests; native window smoke              |
| Source editor / Monaco           | duplicate edits, option or navigation drift                    | source editor and focused edit tests                                           |
| WYSIWYG / Plate                  | paste/drop, serialization, readiness or performance regression | editor integration, preview/zoom and renderer performance tests                |
| React Flow graph                 | node mapping, drag/selection or model drift                    | graph logic, workspace map and style tests                                     |
| Settings / persisted preferences | missing field, defaults or session isolation                   | settings allowlist contract, Rust settings/session tests and affected controls |
| Keyboard shortcuts               | missing defaults, scope or settings drift                      | shortcut catalog, settings and editor/map tests                                |
| IPC / runtime services           | DTO mismatch, broad capabilities or stale events               | typed runtime/service and native capability tests                              |
| Workspace filesystem/services    | path escape, external changes, lost saves or restore races     | real Rust workspace/history/asset tests and native multi-window smoke          |
| Knowledge engine / Rust analysis | parsing, FTS, cache, graph or language drift                   | native analysis/language/MCP tests and `pnpm test:knowledge:integration`       |
| Renderer lifecycle / route cache | stale routes or retained workers                               | route/worker tests and `pnpm test:renderer:e2e`                                |
| Document preview lifecycle       | stale preview data or retained resources                       | preview components, renderer smoke and affected native asset tests             |
| Build/package                    | missing resources, CI or artifact drift                        | renderer build, Rust checks and target packaging                               |
| i18n                             | renderer/native locale mismatch                                | locale/resource and affected UI tests                                          |
| Quality gates                    | stale commands, missing assertions or misleading evidence      | quality tests, impact reporting and lint                                       |

## Plate Large-Document Performance Gate

`Plate performance (software rendering)` retains its CI job name and numerical
budgets. It now builds the production renderer and runs Playwright Chromium with
a test-side typed backend fixture. The fixture is installed by the test harness;
it does not add a production automation API. The `renderer-gpu` project uses
Chromium's default graphics configuration; its name does not prove hardware
acceleration or native Tauri performance.

Both document scenarios use one warmup and five measured runs. Preserve fixture
line/byte/block/sentinel assertions, a single ready editor, first and continuous
input latency, scroll/scrollbar/select-all interactions, frame/long-task/layout
metrics, loading/blank-frame checks, and saved markers in the fixture filesystem.
The attempt budget permits collecting evidence after a failure; any failed
attempt still fails the gate. An unsupported scrollbar must fail explicitly.
Reports retain screenshots, metrics and failure evidence under
`test-results/renderer/` and `playwright-report/renderer/`.

```bash
pnpm test:renderer:e2e
pnpm test:perf:software
pnpm test:perf:all
```

Install Chromium with `pnpm exec playwright install chromium` for local use;
CI installs Chromium and its system dependencies. The production renderer is
built once by each wrapper command; `:run` reuses that build.

The existing `windowOpenToReady*` metric fields measure browser-page startup in
this harness. They do not measure the native hidden-window/splash handshake.
Fixture saves do not execute Rust filesystem/CAS code, and browser memory or CPU
observations do not represent native process totals. The historical Electron
[startup](performance/electron-startup-2026-10-13.md) and
[presentation](performance/window-presentation-2026-10-14.md) samples retain their
original evidence; their removed commands are not current test entry points.

Repository administrators control required checks. The workflow retains the
existing job name and failure artifacts; account-disabled Actions currently
cannot supply a hosted status result.

## Regression Test Rule

Each fix should leave one focused assertion at the boundary that failed. For
example, duplicate menu actions require native dispatch/edit-routing coverage;
wrong graph renderers require node-mapping coverage; persistence drift requires
comparison with the native allowlist; stale IPC needs adapter/event isolation.
Do not replace behavioral assertions with snapshots or file existence alone.

## Desktop Smoke Checklist

Native library tests and Chromium fixture tests complement actual Tauri checks.
Embedded Tauri WebDriver coverage, when configured for the supported platform,
uses the actual native app and must report its own run separately:

- Launch from a fresh temporary profile; verify splash, readiness, failure/retry,
  custom titlebar, focus, geometry and close/quit flush behavior.
- Open a directory and a single file; switch roots and use multiple windows,
  including two windows sharing one root and a third using another root.
- Create, rename, move, edit, save, reopen and restore history; verify external
  modifications preserve drafts and report conflicts without overwriting disk.
- In both editors, check typing, paste, cut/copy, select-all, undo/redo, links,
  images, source navigation and Vim shortcut ownership.
- Exercise graph selection, dragging, keyboard navigation and opening files.
- Change preferences, locale and theme, then reopen and verify persistence and
  native menus/dialogs.
- Exercise affected Git, PTY, WebDAV, AI, export, PDF/media preview and native
  child-webview behavior. Use real target-platform resources where required. Windows custom-window
  behavior is limited to static review in this acceptance pass; do not report a
  Windows integration result.
- Verify installers, OS signing and updater installation separately from source
  builds. System notification authorization is outside the current authorized
  acceptance pass; its policy/library tests do not prove OS permission behavior.

## Standard Verification

```bash
pnpm exec vitest run <affected tests>
pnpm typecheck
pnpm lint
pnpm build:renderer
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --lib --locked -- --test-threads=2
```

Cargo uses the repository's `src-tauri/target` by default. Do not redirect ordinary
build/test artifacts to a temporary target directory. The release workflow runs
renderer regressions before native build jobs; each native job runs library tests
and strict Clippy before drafting artifacts. The separate native workflow covers
Linux x64, macOS ARM and Windows x64 without an application GUI event loop.

## Recorded Acceptance Boundaries

Before removal of the Electron baseline, the full frontend run passed **942 test
files / 5,102 tests** and the existing per-file four-dimensional **85%** gate.
That result applies to the pre-cleanup source tree, not automatically to the
replacement Chromium harness, renamed runtime files, or new AI/MCP work.

Earlier macOS Rust results and cache coverage are recorded in
[Tauri migration](tauri-migration.md). Current cleanup/AI/MCP/native and renderer
checks must record their own executed results against matching source. Workflow
configuration, source inspection and successful compilation do not prove actual
WebView, multi-window, notification permission, installation, signing, updater,
or cross-platform runtime acceptance. GitHub Actions remains unavailable because
the account is disabled; this limitation is not a successful CI result.
