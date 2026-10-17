# Production renderer performance gates

The Playwright projects in `playwright.renderer.config.ts` load the normal `dist`
renderer in Chromium. They run the production Plate editor and Tauri adapter with
an isolated, test-only SDK host. They measure renderer behavior, and do not
represent native Tauri process startup, webview GPU configuration or memory use.
Real desktop integration runs separately through `wdio.tauri.conf.ts`; see
`e2e/tauri/README.md`.

## Commands

- `pnpm test:perf:software` builds the renderer and runs `software-rendering`.
- `pnpm test:perf` builds the renderer and runs `renderer-gpu`.
- `pnpm test:perf:all` builds once and runs both profiles serially.
- Append `:run` to reuse the existing root `dist` build.

Each project measures both deterministic documents: the 1.36 MB, 488-block fixture
and the 4,000-block fixture, each with 29,256 non-empty lines. Fixture contract
checks preserve their byte/line/block counts. Both scenarios require one warmup
and five successful measured samples; any failed attempt fails the gate. Existing
budget constants in `performanceBudgets.ts` remain unchanged.

The journeys preserve initialization and frame budgets, wheel distance, actual
browser scrollbar dragging, complete select-all, input first/p95/max thresholds,
long tasks, layout shifts, zero blank/loading frames, DOM/Slate/chunk limits,
sentinel order and explicit renderer-buffer flush checks. Browser navigation to
Plate readiness uses the original numerical initialization limit and is named
accordingly. The software profile retains the original software rendering flags.
Unsupported required browser probes or a missing scrollbar gutter fail explicitly.

Reports under `test-results/renderer` and `playwright-report/renderer` include
sample collections, original budgets, failed attempts, readiness/diagnostic
records, and before/after/failure screenshots. `performanceStatistics.ts` retains
the original distribution calculations and attempt accounting.

The former process-memory observations, native window-pool metrics, history
restore and map interactions cannot be certified by this browser host. They are
not emitted as zero or null successes. Rust tests and real desktop acceptance
must provide those separate facts; this renderer gate makes no native performance
acceptance claim. The same separation applies to OS selection/IME, clipboard,
Git, PTY, sync, export and notifications.
