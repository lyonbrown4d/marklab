# marklab

A desktop Markdown workspace that blends a Typora-style editor with a project graph.

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
- Lexical, Monaco, CodeMirror 6
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

## Build

```bash
pnpm build
```
