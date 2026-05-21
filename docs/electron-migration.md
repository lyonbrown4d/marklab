# Electron Runtime

Marko uses Electron as the desktop runtime.

## Current Runtime

- Electron owns the desktop shell.
- Electron main owns windows, menus, dialogs, shell/open-path behavior, deep
  links, single-instance behavior, filesystem access, and process access.
- The renderer stays on React, TypeScript, Vite, TailwindCSS, shadcn/ui, and the
  existing editor architecture.
- Renderer desktop access goes through typed preload IPC and domain services.
- Package scripts and npm dependencies target Electron only.

## Goals

- Keep typed IPC contracts explicit.
- Keep native access outside React components.
- Avoid renderer Node.js access.
- Preserve cross-platform behavior on Windows, macOS, and Linux.
- Keep startup time, memory usage, and native dependency size visible tradeoffs.

## Non-Goals

- Do not rewrite the editor.
- Do not replace Monaco, Lexical, React Flow, Zustand, or shadcn/ui as part of
  runtime cleanup.
- Do not introduce an internal HTTP server for app IPC.
- Do not expose generic filesystem, shell, process, or `ipcRenderer.invoke`
  bridges to the renderer.

## Runtime Boundary

Recommended frontend shape:

- `src/services/*`: domain APIs used by React.
- `src/runtime/ipc.ts`: typed command invocation.
- `src/runtime/events.ts`: typed event subscriptions.
- `src/runtime/dialog.ts`: open/save dialogs.
- `src/runtime/window.ts`: window controls.
- `src/runtime/clipboard.ts`: clipboard operations.
- `src/runtime/assets.ts`: local asset URL conversion through the Electron asset
  protocol.

React components should not import Electron APIs directly. Domain services
should depend on the runtime boundary, not on a specific desktop API.

## Electron Structure

Recommended Electron files:

- `electron/main.ts`
- `electron/preload.ts`
- `electron/window.ts`
- `electron/menu.ts`
- `electron/ipc/*.ts`
- `electron/services/*.ts`

Main process responsibilities:

- create windows
- own native menus
- own dialogs
- own shell/open-path behavior
- own deep-link and single-instance behavior
- own filesystem/process access

Preload responsibilities:

- expose a narrow typed API with `contextBridge`
- validate event names and command names
- avoid passing raw `ipcRenderer` through to the renderer

Renderer constraints:

- `nodeIntegration: false`
- `contextIsolation: true`
- no direct Node.js imports
- no generic `ipcRenderer.invoke`

## Desktop Scripts

- `pnpm electron:dev`: run Vite in Electron mode with Electron hot restart.
- `pnpm electron:build`: build renderer, Electron main, and preload through Vite.
- `pnpm electron:start`: build and launch the local Electron entry.
- `pnpm dev:desktop`: compatibility alias for `pnpm electron:dev`.
- `pnpm build:desktop`: compatibility alias for `pnpm electron:build`.

This project does not currently add `electron-builder`. Add a packaging tool only
after the release entry, asset layout, native module rebuild strategy, and
platform signing/notarization requirements are explicit.

## Native Capability Owners

| Capability          | Electron owner                          |
| ------------------- | --------------------------------------- |
| window controls     | `BrowserWindow` methods via IPC         |
| menus               | `Menu` + `webContents.send`             |
| dialogs             | `dialog`                                |
| clipboard           | `clipboard`                             |
| opener              | `shell`                                 |
| single instance     | `app.requestSingleInstanceLock()`       |
| deep links          | `app.setAsDefaultProtocolClient()`      |
| local assets        | `marko-asset` protocol + scoped paths   |
| events              | `webContents.send` + preload listeners  |
| filesystem services | Electron main service with validation   |
| terminal PTY        | Electron main service/native dependency |
| export              | Electron main export service            |

## Acceptance Checklist

- app starts quickly in Electron dev mode
- production Electron build opens the app
- splash-to-main flow works
- native menu actions reach React
- window controls work on Windows, macOS, and Linux
- open workspace and open file work
- file tree create, rename, move, and delete work
- editor buffers save and flush correctly
- markdown graph and search work
- git panel works
- terminal panel works
- export works
- local markdown image assets render correctly
- renderer has no unrestricted Node.js access
