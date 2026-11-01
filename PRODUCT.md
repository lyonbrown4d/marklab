# Marklab Product Direction

## Product register

**Product name:** Marklab

**Register:** Product

**Platform:** Tauri desktop application with a React renderer and Rust services
**Primary users:** Individuals and technical knowledge workers who maintain local Markdown notes, documentation, and wiki-style workspaces.

## Purpose

Marklab is a local-first desktop knowledge workspace. It keeps Markdown as the durable,
portable source of truth while making editing, navigation, search, graph exploration,
embedded resources, synchronization, and optional AI assistance feel like one coherent
desktop experience.

The product is designed for long, keyboard-heavy sessions and for workspaces that can
contain large documents, many files, source code, diagrams, PDFs, images, and web links.
It should remain responsive and understandable as that content grows.

## Positioning

Marklab sits between a focused Markdown editor, a developer-oriented workspace, and a
visual knowledge map. It borrows the immediacy of Typora, the composability of Notion and
Anytype, the direct canvas interactions of AFFiNE and XMind, and the navigation discipline
of mature IDEs without becoming a dashboard-heavy project-management tool.

Markdown is the compatibility and ownership boundary. Rich block editing, source editing,
and workspace graph views are different ways to work with the same local content, not
separate proprietary document systems.

## Product personality

- **Immersive:** content is the dominant surface; chrome stays compact and appears when it
  is useful.
- **Restrained:** controls, color, motion, and decoration communicate state rather than
  compete for attention.
- **Precise:** keyboard behavior, focus, loading, errors, and background work are explicit
  and predictable.
- **Native:** platform conventions, system theme, notifications, window behavior, and file
  associations should feel at home on Windows, macOS, and Linux.

## Core product principles

### 1. Content-first immersion

The editor or workspace map owns the available space. Sidebars, status surfaces, tabs, and
toolbars use progressive disclosure and never create a permanent dashboard around the
document.

### 2. Markdown durability

Users can always retain, inspect, and edit their Markdown. Enhancements should derive from
Markdown, workspace links, or rebuildable local indexes. Features must not silently require
a private document format.

### 3. Direct manipulation

Files, blocks, graph nodes, embedded resources, and viewports should respond where the user
acts. Prefer selection, drag, resize, zoom, and in-place editing over detached configuration
flows.

### 4. Progressive disclosure

Keep default surfaces quiet. Reveal commands, metadata, previews, advanced settings, and AI
actions on intent through hover, selection, shortcuts, contextual menus, or focused dialogs.

### 5. Continuous responsiveness

Opening files, switching tabs, indexing, syncing, exporting, graph calculation, and link
preview generation must not freeze the renderer. Preserve the previous surface as visible
context while new content loads, prevent edits against stale content, cancel stale work,
limit concurrency, and communicate meaningful progress.

### 6. Recoverability over surprise

Destructive or expensive actions require clear intent. Edits, moves, layout changes, and
navigation should be undoable or reversible where practical. Errors must identify the failed
operation and offer a useful retry or recovery path.

## Interaction model

- The title bar contains compact workspace and view-level actions.
- The left workspace drawer can preview on hover and pins open through explicit interaction.
- Floating workspace tabs preserve recent-use navigation within resizable editor
  groups. Each group shows a compact active-title pill; hover reveals its tabs,
  and clicking pins them open. Split right or down, drag tabs to edges or between
  groups, and use group-scoped close and move commands.
- Selecting a document in the graph opens the complete editor beside it, with the graph
  on the left by default. The editor becomes editable when its pane receives focus.
  Non-Markdown files use their ordinary workspace preview in the same groups.
- The bottom status surface contains document state, background work, terminal access, and
  read-only state without duplicating title-bar information.
- Search Everywhere is the unified route to files, workspace text, headings, commands,
  settings, and recent locations.
- The relationship graph is a first-class workspace view. Nodes represent documents and
  directed edges represent Markdown references. File-kind icons distinguish documents,
  attachments, and missing targets. Selecting an existing file opens it beside the graph;
  explicit opening activates its pane. The document inspector provides a bounded local graph.
- Smooth pixel-wheel gestures pan the graph. Ctrl pinch and modified pixel-wheel gestures
  zoom; line/page wheel gestures zoom around the pointer.
- AI is an explicit user capability. Local and remote providers can coexist; automatic AI
  suggestions are opt-in. Local lexical and language-service completion remains independent.

## Anti-references

Marklab should not become:

- a dashboard home that users must pass through before reaching their work;
- a permanent right-hand AI chat sidebar;
- a proprietary block database that merely exports Markdown as an afterthought;
- a wall of fixed toolbars, oversized icons, cards, or unexplained status indicators;
- a collection of visually inconsistent menus and popovers;
- an interface that uses decorative motion or blur at the expense of legibility;
- an application where indexing, previews, sync, history restore, or workspace opening blocks
  the active editor.

## Accessibility and input

- All primary workflows must be keyboard complete, including pane cycling, command search,
  tabs, contextual toolbars, graph navigation, dialogs, and escape behavior.
- Focus must remain visible, high-contrast, and spatially correct after scrolling, zooming,
  resizing, tab switches, and portal-based overlays.
- Light, dark, and system themes must maintain WCAG AA contrast for ordinary text and controls.
- Reduced-motion preferences disable nonessential transitions without removing state feedback.
- IME composition, screen readers, mouse, touchpad gestures, and platform shortcut conventions
  are first-class inputs.
- Loading, empty, success, disabled, and error states must be available to assistive technology
  and must not rely on color alone.

## Decision filter

When product choices conflict, prefer the option that keeps user data portable, the active
surface responsive, the interaction direct, and the interface quiet. Add dependencies only
when they are mature, focused, and materially safer or more capable than a small local
composition.
