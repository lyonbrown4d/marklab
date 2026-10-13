---
title: Search, tasks, and pages
tags: [guide, organization]
---

# Search, tasks, and pages

As your files grow, use filenames to locate pages, full-text search to find content, and collections to organize pages.
Task lists and frontmatter help you record progress and page information.

## Command palette

Quickly tap Shift twice on its own to open the command palette.
The default shortcut is Command+P on macOS or Ctrl+P on Windows/Linux.
You can change shortcuts in Settings; your current displayed bindings take precedence.
Close any modal dialog before opening the palette.

Choose the mode that fits your goal:

- Quick open: find files by name or path.
- Full-text search: find words in document content.
- Commands: run application actions.
- Settings: find a settings option.

Enter your query and select a result. Full-text results help you return to matching content.
The workspace search in the left sidebar also finds workspace content.
Find in document searches just the page you are editing.

## All pages and collections

Run Open All Pages from the command palette to browse your workspace's Markdown files.
Search by title or path, filter by folder, and choose a sort order and view.
Needs attention finds pages with missing links, missing assets, or unresolved anchors.
Linked and Structured help find notes with links or multiple headings.
Clear filters if results seem unexpected. Wait for loading to finish when the index is being built.

## Keep tasks in Markdown

Tasks live in your note's body; you do not need a separate task database.
Check a box in editing mode or change its marker in source mode:

```markdown
- [ ] Read the material
- [ ] Organize notes
- [x] Create a workspace
```

`[ ]` means incomplete; `[x]` means complete.

## Frontmatter: metadata at the top

Place YAML between two `---` lines at the very start of the file:

```yaml
---
title: Weekly review
tags: [weekly, notes]
status: draft
---
```

The editor offers structured fields and a YAML source view.
Titles and tags describe the page. Adding `status` does not run a task or workflow.
Switch to YAML source to inspect more complex fields.

## Try it

- [ ] Search for a sentence from this page
- [ ] Check off a task
- [ ] Inspect this page's title and tags at the top
- [ ] Filter All pages to the guide's folder

[Guide contents](00-Start-Here.md) · [Next: Workspaces and windows](04-Workspaces.md)
