# Marklab Roadmap

## Embedded Markdown Language Service

Status: in progress

The Markdown language service is embedded in the Electron backend. It should not
start an external LSP process for now.

1. [x] Go to definition

   Support Ctrl/Cmd click and editor definition navigation for Markdown links,
   wiki links, and heading anchors.

2. [x] Find references

   Show backlinks for files and heading anchors across the workspace.

3. [x] Rename references

   F2 on a Markdown heading updates the heading text and rewrites workspace
   links targeting that heading anchor. File and folder renames now also rewrite
   Markdown/wiki links that target the moved paths.

   Update Markdown links, wiki links, and heading anchors when files or headings
   are renamed.

4. [x] Code actions

   Offer quick fixes for broken links and broken anchors. First iteration
   supports creating missing Markdown files and removing missing heading anchors.

5. [x] Hover preview

   Show lightweight previews for linked files and target headings.

6. [x] Completion ranking

   Rank suggestions by current directory, path distance, exact match, prefix
   match, and fuzzy match quality.

7. [x] Deeper diagnostics

   Detect duplicate heading slugs, broken image assets, and case-sensitive path
   issues for Markdown links and local assets. Empty links, frontmatter errors,
   and orphaned documents remain candidates for later quality passes.

8. [x] Incremental index

   Reuse a versioned workspace index cache for language-service requests and
   invalidate it on workspace snapshot or buffer changes instead of rebuilding
   for each interactive request.

9. [x] Cancellation and debouncing

   Completion, hover, and code action providers now honor Monaco cancellation
   tokens. Source diagnostics keep stale-request guards and skip realtime checks
   for very large buffers.

10. [x] Editor UI integration

    Source editor now highlights Markdown and wiki link targets as interactive
    ranges. These ranges align with hover previews, Ctrl/Cmd click navigation,
    quick fixes, and rename/reference providers.

## Embedded Non-Markdown Document Previews

Status: planned

Markdown remains Marklab's primary editable and indexable document format.
Other file formats should be treated as linked workspace assets: previewable in
tabs and Markdown embeds where practical, searchable when text extraction is
cheap and reliable, and opened externally when high-fidelity in-app rendering
would add too much weight.

1. [x] PDF and browser-native images

   Recognize PDF and common image files in the workspace, open them in preview
   tabs, and reuse controlled asset URLs instead of reading binary content
   through the text buffer.

2. [x] Audio and video previews

   Support Markdown embeds and preview tabs for common audio and video assets
   using native browser controls. Keep codec compatibility explicit and fall
   back to opening the file in the system app when playback is unavailable.

3. [ ] Text and data previews

   Reuse the existing code-block/source rendering path for plain text, logs,
   JSON, YAML, TOML, and CSV instead of building a separate text viewer. Large
   files should use incremental reads or virtualization instead of loading the
   entire file into React.

4. [x] DOCX preview

   Add a read-only DOCX preview adapter. Prefer a browser-rendered preview for
   document layout and a separate lightweight text extraction path for search.
   Do not attempt full DOCX editing in the first iteration.

5. [x] Diagram previews

   Support drawio-style diagram assets first as previews. Start with embedded
   SVG/PNG variants, then evaluate pure `.drawio` rendering and editor embed
   only after local-first and security boundaries are clear.

6. [x] Whiteboard document adapters

   Add an Excalidraw file adapter as a separate preview/edit surface from
   Markdown editing. Keep the editor lazy-loaded so the Markdown-first path does
   not pay the whiteboard bundle cost.

7. [ ] Office spreadsheet and presentation triage

   Recognize XLSX and PPTX as workspace assets, show metadata, and offer system
   open actions first. High-fidelity in-app preview should remain deferred until
   there is a proven need and a controlled dependency choice.

8. [x] Document adapter registry

   Introduce a small explicit adapter registry for file capabilities such as
   preview, edit, text extraction, thumbnail support, and external-open fallback.
   The registry should drive file-tree icons, context-menu actions, tab routes,
   Markdown embed previews, and index eligibility without becoming a plugin
   framework.
