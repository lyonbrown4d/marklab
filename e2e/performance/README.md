# Electron performance black-box tests

This suite launches the production Electron build through Playwright and measures the real desktop
renderer. It does not add test-only APIs to the production preload surface.

## Commands

- `pnpm test:perf` builds the app and runs the native GPU profile.
- `pnpm test:perf:software` builds the app and runs the software-rendering profile used by CI-like
  environments.
- `pnpm test:perf:all` builds once and runs both profiles serially.
- Append `:run` to any command to reuse an existing `dist` and `dist-electron` build during local
  investigation.

## Scenario

The test creates an isolated workspace containing a deterministic 29,256-line Markdown document.
Every line is non-empty, the UTF-8 byte count and 488-block scale are fixed, and fixture drift fails
before Electron launches. Each profile runs one successful warmup followed by five successful,
measured, isolated Electron sessions. The attempt budget is twice the required sample count so a
failed interaction still appears in the artifact without preventing the remaining samples from
being collected; any failed attempt still fails the gate. The scenario then
opens it in a real Marklab window through the typed preload command, and exercises:

1. single Plate editor initialization;
2. wheel scrolling, including scroll distance and animation-frame timing;
3. native scrollbar-thumb dragging;
4. native `ControlOrMeta+A` selection across the complete document;
5. cross-platform select-all/end navigation, focus, first-edit latency, and continuous typing;
6. blur, explicit workspace-buffer flush, and verification of both markers in the fixture file.

Each interaction samples animation-frame gaps, long tasks, layout shifts, blank editor frames,
loading placeholders, ready-to-loading transitions, and visible Slate content (including computed
visibility and opacity). Observers are drained with `takeRecords()` and publish support flags. Input
latency starts at `beforeinput`, requires a DOM mutation, and ends at the next animation frame; the
reported first/p95/max values exclude keystroke delays and post-interaction settling. Initialization
is installed before Plate is ready and records window-open-to-ready separately. Metrics also include
GPU feature status, isolated runtime paths, heap, geometry, Slate/DOM/chunk counts, and window-pool
data.

Memory observations use Electron's `app.getAppMetrics()` for per-process main, renderer, utility,
GPU, and other-process snapshots. Working-set and available private-memory values are normalized
from Electron kilobytes to bytes; unsupported or zero-filled platform fields remain `null` with an
explicit coverage count instead of being reported as zero. The active renderer snapshot also records
V8 heap, embedder heap, documents, DOM nodes, and event listeners through CDP. Reports include
relative deltas for launcher → large fixture → post-interaction and, when
`MARKLAB_E2E_WORKSPACE` is supplied, small Markdown → large Markdown → Workspace Map. These values
are summarized across measured runs with min, mean, median, p95, max, population standard deviation,
coefficient of variation, platform-field coverage, and successful/failed attempt rates. They are
observability baselines, not fixed memory budgets: compare repeated runs on the same platform and
build before adding a regression threshold.

The suite also seeds a legacy 1.36 MB local-history snapshot and restores it through the real
Timeline → Preview → Confirm interaction. That gate verifies the restored Slate marker, on-disk
content, post-restore input and flush behavior, while measuring frames and long tasks from the final
confirmation until the restored marker is painted.

Native scrollbar dragging only runs against a measurable browser scrollbar gutter. Overlay-only
scrollbars are reported as unsupported and fail the gate explicitly; the test never substitutes a
drag inside document content. The probe positions the viewport instantly at the scroll midpoint,
waits for the exact position to settle, then drags from the geometric midpoint so platform arrow
buttons and application smooth-scrolling preferences cannot create false results.

## Artifacts

Playwright writes run artifacts under `test-results/electron-performance` and the HTML report under
`playwright-report/performance`. Each project attaches:

- before/after screenshots;
- `large-document-metrics.json`;
- `local-history-restore-metrics.json`;
- `performance-budget.json` and `electron-performance.log` even when setup or an assertion fails;
- process and renderer memory snapshots/deltas embedded in the document and real-workspace reports;
- Playwright failure context when a performance or rendering budget is exceeded.

Both directories are ignored by Git. Performance assertions use separate native-GPU and
software-rendering budgets from `performanceBudgets.ts`. Initialization and interaction budgets are
profile-specific; DOM, rendered-element, and chunk-count limits are shared because graphics mode
does not change document structure. Change a budget only with measured evidence and a documented
reason.

The software-rendering profile is the required CI candidate because it is reproducible on the Linux
runner. Native-GPU results remain a local/hardware-specific signal. Budget changes require a fresh
warmup-plus-five sample artifact for both the old and proposed threshold; do not calibrate from a
single run.

The software budgets were recalibrated from an October 2026 Windows software-rendering sample after
the Markdown worker was made DOM-independent. One warmup plus three isolated measured sessions
reported window-open-to-ready at 1,249–1,344 ms, input first/p95/max at 19.3/20.7/27.4 ms, and a
20.9 ms maximum measured interaction frame with no measured long tasks. CI thresholds keep wider
headroom for shared-runner variance, while the 500 ms frame and 1,000 ms cumulative-long-task caps
explicitly reject a return to the prior multi-second main-thread fallback.

After the local-history restore path moved parsing to the Markdown worker and replaced the Plate
document atomically, three October 2026 software-rendering samples restored the same 1.36 MB
snapshot in 935–982 ms. Maximum frame time was 91.7–112.5 ms, cumulative long-task time was
78–83 ms, and post-restore maximum input latency was 15.3–46.8 ms. Before the fix, the same gate
reported 5.3–5.5 second frames and roughly 10 seconds of cumulative long tasks.
