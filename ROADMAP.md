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

9. [ ] Cancellation and debouncing

   Add stale request cancellation, idle diagnostics, large-file guards, and
   workspace-index readiness fallbacks.

10. [ ] Editor UI integration

    Add clear broken-link markers, quick-fix menus, hover cards, command palette
    actions, and Problems panel shortcuts for language-service actions.
