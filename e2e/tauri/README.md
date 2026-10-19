# Native Tauri acceptance

This suite launches the real `src-tauri/target/debug/marklab-desktop` binary through
WebdriverIO's official Tauri service and embedded WebDriver plugin. It uses the
production frontend, runtime adapter and Rust commands. It does not use SDK mocks,
intercept IPC, or load the optional backend execute/mock plugin.

The project runs this integration suite on macOS ARM and Linux. The upstream
embedded driver also supports Windows; Windows integration is not being run in
the current migration validation. Native Windows compilation remains a CI gate.

WebdriverIO 10 requires Node.js 22.19 or later; the repository's Node requirement
is stricter. The latest official Tauri service 1.5.0 still declares a WebdriverIO
9 peer and uses removed APIs. The registered pnpm patches migrate its async
execution and command override calls, including native-utils 2.8.0, to the public
WebdriverIO 10 API. The upstream peer warning remains visible. Remove these
temporary patches when upstream supports 10 and native acceptance passes.

## Build and run

Use the normal repository target directory and an explicit test configuration:

```sh
pnpm exec tauri build --debug --no-bundle --features e2e-testing --config e2e/tauri/tauri.e2e.conf.json
node --experimental-strip-types e2e/tauri/run.ts
```

The build's normal `beforeBuildCommand` creates the production renderer in `dist`.
The `e2e-testing` feature embeds that renderer using `tauri/custom-protocol`.
The feature is optional and off by default, and compiling it in release mode is
rejected. The test configuration uses the distinct identifier
`app.marklab.tauri.desktop.e2e`; it must never be installed or published.

The launcher creates generated Markdown workspaces plus separate canonical,
non-overlapping data/cache directories beneath its own temporary directory.
`MARKLAB_E2E_DATA_DIR` and `MARKLAB_E2E_CACHE_DIR` are required by the backend's
test-only path resolver. No HOME override or production app-data directory is
used. The native application receives `--workspace <alpha>` as real CLI arguments.
Do not invoke the WDIO config directly: the launcher supplies and checks the owned
fixture paths.

Before starting the resident app, the launcher checks cold `--help` and
`--version` output and verifies that missing workspace and positional `.js` targets
exit with code `1` and a startup error. Each preflight has a 15-second process timeout and
uses the same isolated fixture environment.

The service owns the spawned application and stops it during teardown. Its
embedded driver binds to `127.0.0.1` on a fresh OS-allocated port, with one application and one worker at a time.
The separate spec files run as one ordered group against that resident app;
window-state runs first, before another journey selects a second workspace;
`cli.spec.ts` runs last.
The launcher passes that port explicitly to the service and app. Before any
mutation, tests verify the real application identifier and generated workspace
root; an unrelated listener cannot be accepted as the test application. The launcher removes its temporary files after service teardown.
A graphical desktop session is required; on Linux, use the CI display/Xvfb setup.
On macOS, unlock the desktop and keep the test window visible during input and
presentation checks.

## Profile a workspace graph

On macOS, build the debug E2E app as above, then profile a workspace copy:

```sh
node --experimental-strip-types scripts/profile-workspace-graph.ts "/path/to/wiki"
node --experimental-strip-types scripts/profile-workspace-graph.ts "/path/to/wiki" --baseline
```

The script reads the source and copies it into an owned temporary fixture, skipping
`.git`, `node_modules`, `.marklab`, and symlinks. It uses separate test data/cache
directories and removes the copy after service teardown; it does not edit the
source workspace. Keep the graphical session unlocked and the graph window
visible while sampling.

For comparison, preserve an E2E-enabled baseline executable at
`src-tauri/target/debug/marklab-desktop-baseline` before rebuilding the current
binary. `--baseline` sets the test-only `MARKLAB_E2E_BASELINE=1` selector for that
fixed filename; the normal run selects `marklab-desktop`. The profiler runs only
`wikiPerformance.spec.ts`, rather than the full acceptance group.

The `WIKI_GRAPH_PROFILE` console record includes graph payload timing and size,
graph opening time, animation-frame intervals during scripted pan/zoom, rendered
DOM counts, and initial, active, and settled WebContent memory samples. The RSS
field retains the aggregate RSS of newly observed `WebKit.WebContent` processes.
On macOS, physical footprint is sampled for that same PID set with Apple's
`footprint` tool (two-second timeout per PID, at most two concurrent reads).
Any failed read makes the physical aggregate `null`; the record includes a failure
count and availability reason. These are separate snapshots, not whole-app memory.
Compare runs under the same conditions;
these measurements do not establish native OS input correctness. Failure
artifacts can contain content from the copied workspace.

## Checks and evidence

The first journey waits for the actual renderer handshake, verifies the CLI root,
inserts text into Plate through WebDriver's element send-keys endpoint, calls the production buffer flush, and checks the Rust-written
file and buffer snapshot. The second opens a second real native window through
the production command, switches WebDriver window handles, edits a different
workspace, confirms its edit reached the Rust buffer, and closes that owner through the
production runtime's close/flush handshake. The WebDriver close endpoint is never
used because it directly destroys the window. Autosave may finish during driver
round trips; this suite does not assume a buffer stays dirty for a fixed interval.
Runtime and native buffer tests cover deterministic dirty-flush failure paths.
The test checks the closed owner's
final file content and removal from the isolated SQLite session metadata, then
verifies the original window and file remain isolated. Failures retain a screenshot and bounded page source in
`test-results/tauri`; the standard launcher creates synthetic documents only.

The macOS-only `windowState.spec.ts` journey resizes and closes the main window,
checks the official window-state plugin's file beneath the isolated data root,
and launches a second process to reopen the existing application through native
single-instance IPC. It checks workspace geometry precedence and stable window
height. It then removes only the generated fixture's SQLite geometry records and
checks that the plugin restores the default position. Splash, opening and ephemeral
workspace window labels must not appear in the plugin's persistent file.
Another case temporarily replaces only that generated preference file with a
directory and verifies that a plugin write failure does not prevent document
persistence or production window close.

The final `cli.spec.ts` journeys launch the actual executable again with
`--workspace` and `--file`. Both send relative target names from a different
working directory containing spaces. They check the exact native root and kind,
the requested document in the editor, and isolation of the original workspace.
Created windows close through the production handshake. The official
single-instance plugin exits the sender with code `0` before validation;
forwarded help/version output belongs to the running app's console, and invalid
arguments display a dialog there. See the [CLI usage](../../README.md#command-line)
for this terminal limitation.

Window-state tracks the main window's default position, plus its default size on
Windows/Linux. Existing SQLite layouts take precedence; the plugin supplies the
fallback when neither a workspace layout nor the previous default exists.
Workspace-specific geometry and deferred maximization remain in SQLite.
On macOS, size stays in SQLite because released plugin version 2.5.0
captures overlay webview bounds but restores the content rectangle. Neither the
plugin's visibility nor decoration/fullscreen restoration is enabled; production
editor readiness and custom titlebar code continue to own those behaviors.

The pinned embedded driver's Actions keyboard endpoint dispatches JavaScript
keyboard events without inserting text into a contenteditable element. These
journeys position the DOM caret at a real Slate text leaf and observe a stable
document-end selection across Slate's 100 ms selection throttle before using the
supported element send-keys endpoint. Assertions read actual Slate text leaves,
excluding completion hints. File-tree elements are queried again after drawer or
window recreation rather than retaining detached handles.
They wait for native visibility and renderer presentation
before editing. They do not
establish native OS keyboard or IME correctness.

The launcher exits with the WDIO result after service and fixture cleanup. It
does not rely on `process.exitCode`, which WDIO's exit hook can override.

These journeys supplement native Rust tests. They do not replace the existing
coverage threshold, performance budgets, platform compilation, or OS clipboard,
notifications, export and updater acceptance. Chromium renderer/performance tests
remain separately documented in `e2e/renderer` and `e2e/performance`.

References: [Tauri testing](https://v2.tauri.app/develop/tests/),
[Tauri WebDriver guidance](https://v2.tauri.app/develop/tests/webdriver/),
[official service](https://github.com/webdriverio/desktop-mobile/tree/main/packages/tauri-service).
