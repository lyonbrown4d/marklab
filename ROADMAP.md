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

4. [ ] Code actions

   Offer quick fixes for broken links, broken anchors, missing files, and link
   format conversions.

5. [ ] Hover preview

   Show lightweight previews for linked files, target headings, and broken link
   states.

6. [ ] Completion ranking

   Rank suggestions by current directory, recent files, exact match, prefix
   match, and fuzzy match quality.

7. [ ] Deeper diagnostics

   Detect duplicate heading slugs, broken image assets, case-sensitive path
   issues, empty links, frontmatter errors, and orphaned documents.

8. [ ] Incremental index

   Update file paths, headings, links, and diagnostics incrementally instead of
   rebuilding the full workspace index for interactive requests.

9. [ ] Cancellation and debouncing

   Add stale request cancellation, idle diagnostics, large-file guards, and
   workspace-index readiness fallbacks.

10. [ ] Editor UI integration

    Add clear broken-link markers, quick-fix menus, hover cards, command palette
    actions, and Problems panel shortcuts for language-service actions.
