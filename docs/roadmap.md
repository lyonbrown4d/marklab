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

### 0. Markdown Editor Playground Baseline

Goal: keep the WYSIWYG editor aligned with the official Milkdown Crepe playground
baseline before adding MarkLab-specific editor features back.

Scope:

- Use the single-column Crepe editor as the active WYSIWYG baseline.
- Keep official Crepe behavior for block handles, slash menu, toolbar, cursor,
  tables, lists, code blocks, and link editing.
- Scope local editor CSS under a dedicated playground root class instead of
  writing broad `.crepe`, `.milkdown`, or `.ProseMirror` overrides.
- Keep WYSIWYG editor route containers free of transform, contain, and animated
  wrappers that can break fixed-position Milkdown overlays.
- Render fixed-position drag indicators in the viewport coordinate root so the
  block drop line matches ProseMirror `getBoundingClientRect()` coordinates.
- Keep previous MarkLab custom editor addons available in code only when they are
  inactive or explicitly reintroduced behind a reviewed integration point.

Validation:

- Regression tests must verify that only the playground baseline stylesheet is
  imported at runtime.
- Regression tests must verify that WYSIWYG containers do not use app editor card
  shells or route cache motion transforms.
- Regression tests must verify that Milkdown drop cursor overlays are attached to
  the viewport coordinate root.
- Any reintroduced editor customization must prove it does not offset block
  handles, slash menu placement, drag handles, or drop indicators.

### 1. Graph View V2

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

### 2. All Pages

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

### 3. Markdown Collections

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

### 4. Collection Views

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

### 5. Command Center V2

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

### 6. Templates

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
