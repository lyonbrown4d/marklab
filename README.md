# marklab

A desktop Markdown workspace that blends immersive editing with a project graph.

[Website and user guide](https://lyonbrown4d.github.io/marklab/) ·
[Downloads](https://github.com/lyonbrown4d/marklab/releases)

Marklab uses Tauri and Rust for its desktop runtime and native integration, with a
React editor and typed runtime boundary. The former Electron backend and its
packaging dependencies have been removed; historical measurements remain in `docs/performance/`.

## Features

- Markdown editing with block, source, and graph-oriented views.
- Graph view built on React Flow for navigating relationships.
- Tabs, recent projects, and theme switching.
- [Vim mode](docs/vim-mode.md) for source editors, with global and per-tab controls.
- Desktop app targeting Windows, macOS, and Linux.

## Tech Stack

- React 19 + Vite + TypeScript
- Tauri 2 + async Rust desktop backend
- Plate, Monaco
- React Flow, Zustand, Radix UI, Tailwind CSS

## Development

Install the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/)
and Rust 1.99.1 or newer. Use Node.js 24 LTS and pnpm 12.11.2 (pinned in
`package.json`) for build tooling; the Tauri app does not embed Node.js.
Dependency build permissions, including `canvas`, are declared in
`pnpm-workspace.yaml` using `allowBuilds`. Newly published packages can be installed
immediately because this project sets `minimumReleaseAge: 0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

## Desktop (Tauri)

```bash
pnpm dev:desktop   # same as pnpm dev
pnpm build:desktop # compile release binary, without bundling
pnpm package       # compile and bundle for the host platform
```

See [the Tauri migration and release guide](docs/tauri-migration.md) for native
prerequisites, platform targets, signing configuration, and outstanding acceptance
checks. Automatic updates remain unavailable until the updater key and endpoint
are supplied to the build.

## Quality Gates

See [docs/quality-gates.md](docs/quality-gates.md) for the change impact checklist, ownership
boundaries, and desktop smoke checks used to prevent cross-boundary regressions.

## Website

The Astro website and Starlight user guide are maintained in the independent
`website/` workspace. See [website/README.md](website/README.md) for development
and [docs/website.md](docs/website.md) for deployment boundaries.

## Build

```bash
pnpm build
```
