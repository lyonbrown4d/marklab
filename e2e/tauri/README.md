# Native Tauri acceptance

This suite launches the real `src-tauri/target/debug/marklab-desktop` binary through
WebdriverIO's official Tauri service and embedded WebDriver plugin. It uses the
production frontend, runtime adapter and Rust commands. It does not use SDK mocks,
intercept IPC, or load the optional backend execute/mock plugin.

The project runs this integration suite on macOS ARM and Linux. The upstream
embedded driver also supports Windows; Windows integration is not being run in
the current migration validation. Native Windows compilation remains a CI gate.

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
used. The native application receives the first external workspace as a real CLI
argument. Do not invoke the WDIO config directly: the launcher supplies and checks
the owned fixture paths.

The service owns the spawned application and stops it during teardown. Its
embedded driver binds to `127.0.0.1` on a fresh OS-allocated port, with one application and one worker per
run. The launcher passes that port explicitly to the service and app. Before any
mutation, tests verify the real application identifier and generated workspace
root; an unrelated listener cannot be accepted as the test application. The launcher removes its temporary files after service teardown.
A graphical desktop session is required; on Linux, use the CI display/Xvfb setup.

## Checks and evidence

The first journey waits for the actual renderer handshake, verifies the CLI root,
types into Plate, calls the production buffer flush, and checks the Rust-written
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
`test-results/tauri`; fixtures contain no user documents.

These journeys supplement native Rust tests. They do not replace the existing
coverage threshold, performance budgets, platform compilation, or OS clipboard,
notifications, export and updater acceptance. Chromium renderer/performance tests
remain separately documented in `e2e/renderer` and `e2e/performance`.

References: [Tauri testing](https://v2.tauri.app/develop/tests/),
[Tauri WebDriver guidance](https://v2.tauri.app/develop/tests/webdriver/),
[official service](https://github.com/webdriverio/desktop-mobile/tree/main/packages/tauri-service).
