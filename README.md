# marklab

A desktop Markdown workspace that blends immersive editing with a project graph.

Marklab uses Electron for its desktop runtime and native integration while keeping
the React editor and typed runtime boundary explicit.

## Features

- Markdown editing with block, source, and graph-oriented views.
- Graph view built on React Flow for navigating relationships.
- Tabs, recent projects, and theme switching.
- Desktop app targeting Windows, macOS, and Linux.

## Tech Stack

- React 19 + Vite + TypeScript
- Electron desktop runtime
- vite-plugin-electron for Electron main/preload integration
- Milkdown, Monaco
- React Flow, Zustand, Radix UI, Tailwind CSS

## Development

```bash
pnpm dev
```

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
