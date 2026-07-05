# Quality Gates

Marklab is a desktop-first app with several runtime boundaries. Most regressions come from a
change crossing one of those boundaries without a matching check. Use this guide before merging
non-trivial changes.

## Ownership Boundaries

- Electron owns native menus, windows, dialogs, shell access, app identity, deep links, and
  packaging.
- Preload and runtime adapters own typed renderer-to-desktop communication. Renderer code should
  not call Electron directly.
- Monaco owns source-code editing behavior. App commands may bridge into Monaco actions, but
  native text accelerators should stay native.
- Milkdown owns WYSIWYG editing behavior. Editor shortcuts should run through the Milkdown command
  layer.
- React Flow owns graph canvas interaction. Graph data must explicitly map to registered node
  renderers.
- Zustand owns renderer preferences and persisted UI defaults.
- The Rust knowledge engine owns indexing and knowledge-heavy work. Electron owns process lifecycle
  and request routing.

If two layers handle the same input, persistence value, or lifecycle event, consolidate ownership
before adding behavior.

## Change Impact Checklist

Mark every touched area, then run the matching checks.

Use the helper before committing to map changed files to likely impact areas:

```bash
pnpm quality:impact
pnpm quality:impact --staged
pnpm quality:impact --base origin/main
pnpm check
```

`pnpm check` runs the quality impact helper as part of the project-level gate, so local
verification and CI use the same entry point.

| Impact area                      | Common risk                                                    | Required checks                                        |
| -------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| Electron menu/window/preload     | double dispatch, unsafe IPC, platform mismatch                 | relevant Electron/preload tests, `pnpm exec tsc -b`    |
| Source editor / Monaco           | duplicated edit commands, option drift, focus routing          | source editor tests, focused edit tests                |
| WYSIWYG / Milkdown               | command mismatch, paste/drop regression, editor sync drift     | Milkdown command/paste/sync tests                      |
| React Flow graph                 | default node renderer fallback, drag/selection conflicts       | graph logic, graph node, and graph interaction tests   |
| Settings / persisted preferences | default drift, missing partialize field, inaccessible controls | settings tests, affected component option tests        |
| IPC / runtime services           | stringly payloads, broad capability exposure                   | runtime/preload/service contract tests                 |
| Workspace filesystem/services    | path normalization, sidecar routing, unsafe asset access       | workspace service and sidecar/path tests               |
| Knowledge engine / Rust sidecar  | spawn/config drift, protocol mismatch, blocking work           | cargo checks/tests and knowledge boundary tests        |
| Build/package                    | CI/task drift, missing resources, oversized bundles            | Electron build or targeted packaging checks            |
| i18n                             | untranslated menu/settings text                                | locale resource checks or affected UI tests            |
| Quality gates                    | stale checklist, missing boundary guard, outdated guidance     | quality gate tests, `pnpm quality:impact`, `pnpm lint` |

## Regression Test Rule

Every bug fix should leave one narrow regression test at the boundary that failed.

Examples:

- A native menu shortcut fires twice: test that the native menu uses Electron edit roles.
- A file/root graph node ignores theme: test that `file` nodes map to a custom React Flow node.
- A setting does not affect Monaco: test the store-to-surface option path.
- An IPC response shape drifts: test the service adapter contract, not only the component.

Prefer contract tests over snapshots. The assertion should name the behavior that must not regress.

## Desktop Smoke Checklist

Run this manually for broad UI/runtime iterations:

- Open a project and a single file.
- Create, rename, save, and reopen a Markdown file.
- WYSIWYG: type, paste, cut, copy, select all, undo, redo, insert link/image.
- Source: type, paste, cut, copy, select all, undo, redo, jump to diagnostics/backlinks.
- Graph: open, select, drag, keyboard navigate, create/delete heading, double-click open.
- Settings: toggle a changed setting, reload, confirm persistence.
- Theme and locale: switch once and check menus, dialogs, settings, graph, and editors.
- Electron native menu: check File, Edit, View, Settings, and About entries.
- Build sanity: run the targeted build for changes touching Electron, preload, packaging, or assets.

## Standard Verification

Use the narrowest checks while working, then broaden before committing:

```bash
pnpm exec vitest run <affected tests>
pnpm exec tsc -b
pnpm lint
pnpm exec vite build --mode electron --logLevel error
git diff --check
```

For Rust or knowledge-engine changes, add:

```bash
cargo fmt --all --check
cargo check --workspace
cargo test --workspace
pnpm test:knowledge:integration
```

For dependency updates or packaging changes, prefer `pnpm build:desktop` or the platform-specific
dist command after targeted tests pass.
