# AGENTS.md

# Project Overview

This is a desktop-first application built around Electron.

The current codebase uses:

- Electron
- secure preload IPC
- React renderer
- React
- TypeScript
- Vite
- TailwindCSS
- shadcn/ui

Architecture goals:

- local-first
- low memory usage
- fast startup
- cross-platform
- controlled dependencies
- typed IPC communication
- maintainable codebase

Frontend and backend responsibilities should remain clearly separated.

---

# Core Principles

Prefer:

1. simpler solutions
2. explicit code
3. typed interfaces
4. composition over abstraction
5. low-memory approaches
6. reuse over reinvention
7. existing libraries over custom implementations

Avoid unnecessary complexity.

Do not introduce large abstraction systems unless clearly justified.

Avoid:

- framework-like internal architectures
- excessive indirection
- premature optimization
- over-generalization
- hidden side effects
- magic runtime behavior

---

# Frontend Rules

## React

- Prefer functional components.
- Keep components focused and small.
- Avoid deeply nested component trees.
- Avoid unnecessary hooks abstractions.
- Avoid giant context providers.
- Prefer explicit props over implicit shared state.

## State Management

Preferred order:

1. local component state
2. lifted state
3. Zustand for shared app state

Avoid Redux-style architectures unless absolutely necessary.

Global state should remain minimal.

## Async UI

All async operations must:

- handle loading state
- handle cancellation when applicable
- handle errors explicitly

Do not leave unresolved async side effects.

## Styling

Use:

- TailwindCSS
- shadcn/ui
- Radix primitives

Avoid:

- CSS-in-JS runtime solutions
- custom styling frameworks
- large custom CSS files
- inline style-heavy implementations

Prefer utility-first styling.

## Code Style

- Prefer arrow functions assigned to `const` for ordinary functions.
- Do not add `FunctionDeclaration` code unless it is required for a type
  declaration or an external API shape.
- Split files before they exceed 300 effective lines; files over 300 lines must
  be broken into focused modules.

---

# UI Component Rules

## Prefer Existing Components

Before implementing a custom component, first check:

1. shadcn/ui
2. Radix UI primitives
3. existing project components
4. lightweight wrappers
5. fully custom implementation only if necessary

Do not reinvent common UI primitives.

Prefer existing solutions for:

- Button
- Input
- Select
- Dropdown
- Dialog
- Drawer
- Tabs
- Tooltip
- Popover
- Table
- Toast
- Form controls
- Command palette
- Menus
- Date picker
- Context menu

## Custom Components

Only create custom components when:

- no existing component fits
- composition is insufficient
- the component contains domain-specific behavior
- reuse is expected

Do not build generic internal UI frameworks.

## Accessibility

Prefer Radix/shadcn primitives because they already handle:

- keyboard navigation
- focus management
- accessibility attributes
- interaction edge cases

Do not replace accessible primitives with custom div-based implementations.

---

# Desktop Runtime and IPC Rules

## IPC Communication

Frontend desktop integration must go through an explicit runtime boundary.

Preferred frontend shape:

- `src/services/*` expose domain APIs.
- domain APIs call a small runtime IPC adapter.
- React components do not import Electron APIs directly.

Electron renderer communication must use:

- preload APIs exposed through `contextBridge`
- typed request/response IPC
- typed event subscriptions

Renderer code should use the shared runtime adapter and Electron preload IPC.

Avoid introducing internal HTTP servers unless explicitly required.

## IPC Payloads

- Keep IPC payloads small.
- Avoid transferring large binary content through IPC.
- Use filesystem or streaming approaches for large content.

## Commands

Commands must:

- return typed structures
- avoid stringly-typed JSON
- avoid panic/unwrap-style failures in production backend paths
- validate frontend inputs

## Events

Use events for:

- progress updates
- streaming tasks
- background status

Do not use events as a global message bus.

## Electron Main Process

Electron main process code owns:

- window creation and lifecycle
- native menus
- dialogs
- shell/open-path behavior
- deep links and single-instance behavior
- filesystem and process access

Electron renderer code must not receive unrestricted Node.js access.

Use:

- `contextIsolation: true`
- `nodeIntegration: false`
- a narrow preload API surface
- path validation for filesystem operations
- explicit allowlists for shell/process actions

Do not expose generic `ipcRenderer.invoke(channel, payload)` to the renderer.
Expose named, typed methods instead.

# Frontend vs Backend Responsibilities

Business logic belongs outside React when it is:

- filesystem-heavy
- CPU-heavy
- indexing-heavy
- streaming-heavy
- security-sensitive
- long-running

This logic may live in an Electron main-process service or a dedicated sidecar,
depending on implementation cost.

UI orchestration belongs in React.

Avoid:

- frontend filesystem crawling
- frontend-heavy indexing logic
- frontend CPU-intensive processing

---

# Sidecar Backend Rules

## Error Handling

Never use:

- unwrap()
- expect()

in production paths.

Use structured error handling consistently.

Preferred:

- anyhow
- thiserror

Errors should remain typed and actionable.

## Async & Concurrency

- Prefer tokio async tasks.
- Avoid blocking the runtime.
- Use spawn_blocking for CPU-heavy work.
- Prefer incremental processing.

## Filesystem

- Prefer streaming reads/writes.
- Avoid loading huge files fully into memory.
- Use incremental scanning/indexing strategies.

## Architecture

Prefer:

- service-oriented modules
- explicit data flow
- small focused modules

Avoid:

- god services
- giant managers
- hidden global mutable state
- over-engineered plugin systems

Do not introduce abstraction layers unless repetition clearly justifies them.

## Security

- Minimize desktop runtime capabilities.
- Avoid broad Electron/Node access in renderer code.
- Avoid enabling unnecessary shell access.
- Validate all user input.
- Do not expose unsafe filesystem access patterns.

---

# Performance Rules

Performance matters.

Optimize for:

- startup time
- memory usage
- responsiveness
- incremental rendering
- lazy loading

Avoid:

- synchronous startup scans
- unnecessary watchers
- excessive rerenders
- loading large datasets eagerly

Debounce expensive UI operations.

Use virtualization for large lists when needed.

---

# Dependency Rules

Before adding a dependency:

1. verify the project actually needs it
2. prefer existing ecosystem solutions
3. prefer smaller focused libraries
4. check maintenance quality
5. check bundle/runtime impact

Avoid dependency bloat.

Do not add dependencies for trivial utilities.

---

# Project Structure

## Frontend

Recommended structure:

- src/components
- src/features
- src/pages
- src/hooks
- src/lib
- src/state
- src/types

## Backend

Recommended structure:

- electron/main
- electron/preload
- electron/ipc
- electron/services

Keep boundaries explicit.

---

# Preferred Patterns

Good patterns:

- thin UI layer
- typed IPC contracts
- service-oriented backend
- incremental processing
- explicit state flow
- reusable composition

Bad patterns:

- giant React contexts
- hidden mutable state
- generic runtime frameworks
- unnecessary factories
- excessive adapters
- over-engineered abstractions
- custom UI primitives for common controls

---

# Build & Tooling

Frontend:

- pnpm
- vite

Backend:

- electron/main
- electron/preload
- electron/ipc
- electron/services

Common commands:

- pnpm electron:dev
- pnpm electron:build
- pnpm electron:start
- pnpm dev:desktop
- pnpm build:desktop

---

# AI Agent Constraints

When modifying code:

- prefer editing existing files over creating new ones
- prefer reuse over replacement
- avoid broad refactors unless necessary
- preserve existing architecture patterns
- keep changes incremental
- avoid introducing parallel implementations unless they are part of the
  explicit Electron migration compatibility layer

When uncertain:

- choose the simpler solution
- ask for clarification rather than inventing architecture

---

# Debugging & Automation

Do not introduce:

- automation plugins
- debugging backdoors
- development-only capabilities
- screenshot tooling
- MCP tooling
- remote execution capabilities

into production builds unless explicitly requested.

---

# Important Constraints

This is a desktop-first application.

Do not introduce:

- server-centric architectures
- unnecessary backend services
- unrestricted Node.js access in renderer code
- generic shell/process bridges
- browser-only assumptions

Cross-platform compatibility matters.

Binary size matters.

Resource usage matters.
