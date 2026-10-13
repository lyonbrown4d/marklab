# marklab

A desktop Markdown workspace that blends immersive editing with a project graph.

Marklab uses Electron for its desktop runtime and native integration while keeping
the React editor and typed runtime boundary explicit.

## Features

- Markdown editing with block, source, and graph-oriented views.
- Graph view built on React Flow for navigating relationships.
- Tabs, recent projects, and theme switching.
- [Vim mode](docs/vim-mode.md) for source editors, with global and per-tab controls.
- Desktop app targeting Windows, macOS, and Linux.

## Tech Stack

- React 19 + Vite + TypeScript
- Electron desktop runtime
- vite-plugin-electron for Electron main/preload integration
- Plate, Monaco
- React Flow, Zustand, Radix UI, Tailwind CSS

## Development

Use Node.js 24 LTS and pnpm 12.11.2 (the version pinned in `package.json`).
Dependency build permissions, including `canvas`, are declared in
`pnpm-workspace.yaml` using `allowBuilds`. Newly published packages can be installed
immediately because this project sets `minimumReleaseAge: 0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

For Electron downloads through npmmirror, set the `ELECTRON_MIRROR` environment
variable before installing. pnpm 12 no longer reads custom settings from `.npmrc`.

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ pnpm install --frozen-lockfile
```

In PowerShell, set `$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'`
before running `pnpm install --frozen-lockfile`.

## Desktop (Electron)

```bash
pnpm electron:dev
```

Compatibility aliases are also available:

```bash
pnpm dev:desktop
pnpm build:desktop
```

## Electron Migration

See [docs/electron-migration.md](docs/electron-migration.md).

## Quality Gates

See [docs/quality-gates.md](docs/quality-gates.md) for the change impact checklist, ownership
boundaries, and desktop smoke checks used to prevent cross-boundary regressions.

## Build

```bash
pnpm build
```
