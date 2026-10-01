# AI interaction design QA

## Comparison target

- Source visual truth: `C:\Users\12783\.codex\generated_images\01a0ec98-36a6-7d52-8af7-b9ea0d998f93\exec-a8aa4df6-7904-4309-817b-0a7ae9043eb6.png`
- Implementation screenshot: `.tmp/design-qa/ai-inline-companion.png`
- Settings screenshot: `.tmp/design-qa/ai-settings.png`
- Combined comparison: `.tmp/design-qa/ai-inline-comparison.png`
- Viewport: `1440 × 1024` desktop viewport at 1× density.
- State: light system theme, Markdown text selected, contextual AI proposal visible with word-level additions and removals.

## Full-view comparison evidence

- The selected interaction remains anchored to the active writing context instead of opening a permanent right sidebar.
- The proposal keeps the original document visible, presents word-level differences in place, and exposes Accept, Abandon, and Try again as a compact decision row.
- The implementation deliberately follows MarkLab's current monochrome token system instead of copying the concept image's blue accent color.
- The implementation uses a short deterministic E2E document, while the concept image uses a longer editorial sample; this changes surrounding whitespace but not the interaction geometry.

## Focused interaction evidence

- A local loopback OpenAI-compatible test provider was configured through Settings without an API key.
- The renderer invoked the typed preload API, Electron main called the provider, and the returned replacement travelled through the generation event channel into the proposal diff.
- Accept applied the replacement in one editor transaction and closed the companion.
- The Settings AI page exposes the built-in runtime state, cross-platform model directory, custom-directory switch, migration explanation, model metadata, explicit download action, and external provider configuration.
- No model download starts automatically during settings or editor tests.

## Findings

- No actionable P0, P1, or P2 visual or interaction issues remain in the tested AI flow.
- The previously mixed English Qwen model description in the Chinese settings page was localized before the final capture.
- Direct Computer Use inspection was attempted, but the available integration returned no controllable application surfaces. Electron Playwright was used for rendered visual evidence and interaction verification instead.

## Verification

- Electron Playwright: 4/4 tests passed, including provider configuration, proposal generation, diff actions, accepted editor mutation, secure preload, and modal first paint.
- Vitest: 328 files and 1555 tests passed with four workers.
- TypeScript typecheck, ESLint, renderer/main/preload Electron build, and `git diff --check` passed.
- The built-in 429 MB model was not downloaded during QA; downloads remain explicit by design. Native runtime packaging and load rules were verified separately, while macOS/Linux native packaging still requires their respective platform CI runners.

final result: passed
