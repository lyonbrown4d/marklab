# MarkLab Roadmap

MarkLab is a Markdown-first local knowledge workspace. The canonical data should
remain plain Markdown files, frontmatter, links, task lists, and local
attachments. Product features should project from those files instead of moving
the workspace into a proprietary database model.

## Product Principles

- Markdown remains the primary source of truth.
- Graph, table, board, calendar, timeline, and command views are projections.
- Indexes must be rebuildable from the workspace.
- Features should work offline and stay local-first.
- File-system transparency matters more than closed workspace abstractions.
- New capabilities should preserve fast startup and low memory usage.

## Near Term

### Markdown Editing Experience

Goal: remove friction from daily Markdown editing before adding more block
types. MarkLab should combine Typora-style Markdown interoperability, iA
Writer-style focus, Obsidian-style document analysis, and a restrained subset
of Notion-style block interactions while keeping plain Markdown as the source
of truth.

#### Priority 1: Editing Loop

Status: in progress

First iteration:

- [x] Keep the document outline synchronized with the caret, highlight and
      reveal the active heading, and allow heading branches to be collapsed without
      weakening outline search or navigation.
- [x] Complete clipboard semantics for rich editing: publish useful rich and
      plain formats on normal copy, provide copy as Markdown, and provide explicit
      paste-as-plain-text or paste-as-Markdown behavior.
- [x] Add a click-activated block-handle menu for block conversion, duplication,
      movement, deletion, and clipboard actions while preserving direct drag and
      keyboard interaction.

Follow-up editing-loop work:

- [x] Show word and character counts for text selections and block counts for
      multi-block selections.
- [x] Preserve predictable selections and caret placement after cut, paste,
      move, duplicate, and block conversion operations.
- [x] Group structural editor operations into coherent undo steps.

Validation:

- Component tests for outline tracking, collapse, search, and heading
  navigation.
- Clipboard contract and editor integration tests for rich copy, Markdown copy,
  plain paste, empty selections, read-only mode, and code blocks.
- Interaction tests proving that the block menu does not regress pointer drag,
  keyboard movement, multi-block selection, focus restoration, or undo.
- Playwright coverage for the complete rich-editor editing loop on macOS and
  Windows keyboard conventions.

#### Priority 2: Analysis In The Editor

Status: in progress

- [x] Surface existing Markdown diagnostics directly in the rich editor with
      lightweight decorations and actions to navigate or apply safe quick fixes.
- [ ] Extend diagnostics for heading-level gaps, duplicate or unresolved
      footnotes, malformed frontmatter, missing image alternative text, and other
      source-compatible structural issues.
- [ ] Add rich-editor workspace-link completion for `[[file]]` and heading
      anchors, with explicit create-file and replace-anchor actions for unresolved
      targets.
- [ ] Add unlinked-mention discovery using the rebuildable workspace index,
      keeping probable mentions separate from explicit backlinks.
- [ ] Provide a structured frontmatter editor for common scalar, date, boolean,
      list, tag, and link values while preserving unsupported YAML losslessly and
      retaining a source-mode escape hatch.

Validation:

- Keep analysis work incremental, cancellable, and outside React when it is
  workspace-wide or parsing-heavy.
- Every rich-editor diagnostic must map back to a stable Markdown source range
  and must not change the document unless the user invokes a quick fix.
- Round-trip tests must prove that link completion, frontmatter editing, and
  quick fixes preserve unrelated Markdown syntax and unsupported constructs.
- Large documents must retain the existing editor performance policy and avoid
  mounting workspace-wide analysis plugins in the renderer.

### 0. Plate Markdown Editor Baseline

Goal: keep the WYSIWYG editor aligned with Plate and Slate primitives while
preserving MarkLab's Markdown-first behavior.

Scope:

- Use the Plate editor as the active WYSIWYG baseline.
- Compose Plate plugins for slash commands, selection controls, tables, lists,
  code blocks, media, and link editing.
- Scope local editor CSS under the dedicated Plate editor root instead of
  writing broad Slate content-editable overrides.
- Keep WYSIWYG editor route containers free of transform, contain, and animated
  wrappers that can break fixed-position editor overlays.
- Render fixed-position drag indicators in the viewport coordinate root so the
  block drop line matches Slate element `getBoundingClientRect()` coordinates.
- Integrate MarkLab editor addons through explicit Plate plugins and focused
  hooks so each capability remains testable and replaceable.

Validation:

- Regression tests must verify that only the Plate editor stylesheet is imported
  at runtime.
- Regression tests must verify that WYSIWYG containers do not use app editor card
  shells or route cache motion transforms.
- Regression tests must verify that editor overlays are attached to the correct
  viewport coordinate root.
- Any reintroduced editor customization must prove it does not offset block
  handles, slash menu placement, drag handles, or drop indicators.

### 1. Markdown Editor Navigation V1

Goal: make the editor feel like a knowledge workspace while keeping Markdown as
plain files.

Scope:

- Upgrade the right inspector from a passive outline into a searchable document
  navigator for headings, backlinks, outgoing references, missing references,
  problems, assets, and file properties.
- Keep backlinks and mentions derived from the workspace index; do not introduce
  a proprietary note relationship store.
- Add smart link quick fixes for missing files and missing heading anchors,
  including replacing a broken anchor with an existing heading anchor when the
  target file exists.
- Keep editor navigation actions source-compatible: clicking outline,
  backlinks, mentions, or problems should jump to the file and source position
  without requiring a custom block model.
- Use sidecar/workspace-index data for cross-file information and only parse the
  active dirty buffer locally when needed for immediate editing feedback.

Validation:

- Unit tests for backlink, outgoing, missing-link, and heading navigator data.
- UI tests for filtering and opening navigator entries.
- LSP tests for missing-file and missing-anchor quick fixes.
- Avoid mounting extra expensive editor plugins just to power the inspector.

### 2. Graph View V2

Goal: make the graph useful for navigation, diagnosis, and knowledge discovery,
not just visualization.

Scope:

- Add a graph inspector for selected nodes.
- Show inbound links, outbound links, backlinks snippets, headings, tags,
  frontmatter, modified time, and related files.
- Add graph filters for current file neighborhood, folder, tags, orphan notes,
  broken links, and file kind.
- Add hover previews with title, path, summary, and key metadata.
- Add graph search for files, headings, tags, and related nodes.
- Add layout presets for local neighborhood, folder clusters, tag clusters, and
  recent activity.

Validation:

- Unit tests for graph data derivation and filters.
- UI tests for node selection, hover preview, and filter state.
- Keep large graph rendering incremental and avoid eager workspace-wide React
  rerenders.

Sidecar migration contract:

- Markdown parsing, workspace graph derivation, outline graph derivation,
  diagnostics, and search are pure projections from document content plus known
  workspace paths, so they can move behind the existing worker/sidecar boundary.
- The sidecar should output a stable canonical Markdown graph snapshot: files,
  headings, links, anchors, source ranges, content blocks, and semantic edge
  kinds such as `contains`, `links_to`, and `references_heading`.
- The sidecar must not output ReactFlow-specific layout, viewport, curve,
  selection, hover, or animation data; those are renderer responsibilities.
- Electron main should keep ownership of workspace root state, filesystem reads,
  dirty-buffer merging, known path collection, path validation, and DTO
  conversion between sidecar contracts and renderer-facing IPC contracts.
- Electron main may use worker threads or child processes for expensive buffer
  assembly and DTO conversion, but it should not grow a duplicate Markdown
  parser once sidecar parity is reached.
- Regression coverage should preserve heading-link graph semantics, outline
  hierarchy, heading content ranges, parsed outline content blocks, dirty-buffer
  outline input, sidecar document/known-path handoff, and no-fallback behavior on
  sidecar graph failures.
- Cleanup should avoid duplicate parser implementations in the renderer; keep
  `workspaceAnalysisService` as an orchestration layer and remove TypeScript
  parser code only after sidecar parity tests pass.

### 3. All Pages

Goal: provide a Notion-like all-pages surface while keeping Markdown files as the
underlying data.

Scope:

- Add a workspace-wide page list.
- Show title, path, folder, tags, frontmatter summary, modified time, word count,
  backlinks count, and file kind.
- Support sorting by name, modified time, backlinks, and folder.
- Support quick filtering by folder, tag, file kind, and text query.
- Open files directly from rows without introducing a separate page model.

Validation:

- Unit tests for metadata extraction and sorting.
- UI tests for filtering, sorting, and opening a page.
- Ensure metadata can be rebuilt from file content and workspace index.

### 4. Markdown Collections

Goal: provide a Markdown-first alternative to databases.

Scope:

- Define saved collections as rules over files, frontmatter, tags, paths, and
  tasks.
- Support rules such as folder prefix, filename contains, has tag, frontmatter
  field equals, modified within, has task, and has broken link.
- Store collection definitions in a transparent Markdown-compatible project file
  or a small MarkLab settings file, not inside indexed state.
- Let collections reuse the All Pages metadata model.

Validation:

- Unit tests for the collection rule engine.
- UI tests for creating, editing, and applying saved collections.
- Ensure deleting the index does not delete collection definitions.

## Mid Term

### 5. Collection Views

Goal: let the same Markdown collection switch between useful views without
creating a proprietary database.

Scope:

- Table view from frontmatter fields and file metadata.
- Board view grouped by a selected frontmatter field such as `status`.
- Calendar view from `date`, `due`, `start`, or `end` frontmatter fields.
- Timeline view from `date`, `start`, and `end` fields.
- Task view from Markdown task list items.
- Empty states that explain which Markdown fields power each view.

Validation:

- Unit tests for field inference and view grouping.
- UI tests for switching views and preserving filters.
- Keep unsupported files visible as files, not invalid database rows.

### 6. Command Center V2

Goal: make the titlebar command center the fastest path to content and actions.

Scope:

- Search files, headings, full text, backlinks, graph nodes, settings, actions,
  templates, and recent files.
- Show result type, path, match snippet, and keyboard shortcut when applicable.
- Support scoped commands such as "open in graph", "copy markdown link", and
  "create from template".
- Keep command search cancellable and incremental.

Validation:

- Unit tests for result ranking and result grouping.
- UI tests for keyboard navigation and action execution.
- Performance checks for large result sets.

### 7. Templates

Goal: speed up common Markdown creation flows without changing the file format.

Scope:

- Add a template gallery for common Markdown documents.
- Include meeting notes, project specs, decision records, daily notes, weekly
  reviews, reading notes, bug reports, research notes, architecture notes, and
  changelogs.
- Add "new file from template" from file tree and command center.
- Add `/template` from the editor slash menu.
- Support variables such as title, date, folder, and selected text.
- Store user templates as Markdown files in a transparent templates directory.

Validation:

- Unit tests for template variable rendering.
- UI tests for creating a file from a template.
- Ensure generated content remains plain Markdown.

## Deferred

### Attachment Hub

This is useful, but it is deferred for now. The current priority is improving
Markdown navigation, graph, collections, views, command search, and templates.

### Knowledge Map / Canvas

This is also deferred for now. Freeform canvas work should not start until the
Markdown-first graph and collection workflows are strong enough to justify a
canvas projection.

## Not In Scope

- Full Notion-style proprietary databases.
- Replacing Markdown files with an opaque workspace document model.
- Real-time multiplayer collaboration.
- A custom infinite whiteboard engine.
- AI-first workflows that make core editing dependent on cloud services.
