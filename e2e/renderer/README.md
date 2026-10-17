# Production renderer acceptance

These tests load the normal `dist` build in Playwright Chromium. The production
Tauri adapter runs unchanged. Before navigation, `addInitScript` installs an
in-memory IIFE built from the official `@tauri-apps/api/mocks` helpers and a small
test-only command fixture. No fixture module, automation capability, or debug
command enters the application build.

The fixture backend operates only on isolated temporary workspaces. Its buffer
tests verify revision checks, UTF-16 patches, stale generation rejection and the
renderer flush contract. Test-only opaque asset capabilities serve bounded fixture
files and expire when their workspace changes. They do not verify native asset
issuance, the native Rust save implementation,
OS clipboard, native window permissions, or filesystem durability.

## Running

Build the production renderer with `pnpm build:renderer`, then run:

- `pnpm exec playwright test --config playwright.renderer.config.ts --project smoke`
- `pnpm exec playwright test --config playwright.renderer.config.ts --project software-rendering`
- `pnpm exec playwright test --config playwright.renderer.config.ts --project renderer-gpu`

The config starts Vite preview against `dist`. Install the existing Playwright
Chromium browser before running these commands. Each sample gets a new browser
context and temporary workspace; no GUI desktop process is launched.

## Preserved renderer gates

The smoke project covers adapter startup, modal first paint, responsive layout,
settings centering, contextual menus, status/read-only controls, sidebar focus,
system color scheme, document statistics, math/footnotes, selection toolbar
anchoring, browser page scaling, composition events, document changes, and source
model/preview isolation after a workspace seed changes.

The two performance projects reuse the fixed 29,256-line text-heavy and
4,000-block fixtures, frame/long-task/layout/input probes, and unchanged budget
values. Both documents require one warmup and five measured samples. Any failed
attempt still fails the gate. Checks retain sentinel order, complete selection,
actual browser scrollbar dragging, editor/chunk/DOM limits, zero blank/loading
frames, input first/p95/max thresholds, and renderer buffer flush verification.

The initialization metric is browser navigation to Plate readiness. It uses the
existing numerical initialization budget but does not represent native process
or window startup. The GPU project measures Chromium rendering on its runner;
it does not certify Tauri's platform webview or GPU configuration.

Artifacts under `test-results/renderer` and `playwright-report/renderer` include
metric collections, unchanged budget values, failed attempts, renderer errors,
diagnostic reports, readiness phases, and before/after/failure screenshots.

## Separate native acceptance

Native window lifecycle/root ownership, Git, PTY, atomic saves, sync, export,
assets, credentials and native notifications remain Rust/platform acceptance
responsibilities. SDK mocks do not establish their correctness. Likewise native
startup, window pools, process memory, embedded external webviews and OS zoom or
IME behavior require actual desktop evidence. They are absent from this browser
report rather than represented by fabricated zero or unsupported placeholder
metrics.

This suite ports the renderer assertions from the previous release smoke,
editor integration and workspace model-isolation journeys. Other UI journeys
(tables, block dragging, Vim, find/replace, contextual completion, AI, history,
publication and workspace map) need their focused RTL/native/GUI acceptance
evidence tracked separately; this suite does not claim to cover them all.
