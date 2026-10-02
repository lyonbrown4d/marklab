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

The test creates an isolated workspace containing a deterministic 29,256-line Markdown document,
opens it in a real Marklab window through the typed preload command, and exercises:

1. initial single-editor load;
2. wheel scrolling;
3. native scrollbar-thumb dragging;
4. native `Ctrl+A` selection across the complete document;
5. focus and sequential typing in the ProseMirror editor.

Each interaction samples animation-frame gaps, long tasks, layout shifts, blank editor frames,
loading placeholders, and visible editor-surface counts. It also records load, focus, typing,
heap, document geometry, and window-pool data.

## Artifacts

Playwright writes run artifacts under `test-results/electron-performance` and the HTML report under
`playwright-report/performance`. Each project attaches:

- before/after screenshots;
- `large-document-metrics.json`;
- Playwright failure context when a performance or rendering budget is exceeded.

Both directories are ignored by Git. Performance assertions use separate native-GPU and
software-rendering budgets from `performanceBudgets.ts`; change a budget only with measured evidence
and a documented reason.
