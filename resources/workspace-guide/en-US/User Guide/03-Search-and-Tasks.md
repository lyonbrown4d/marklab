---
title: Search, tasks, and pages
tags: [guide, organization]
status: reference
---

# Search, tasks, and pages

## Find a page or passage

Quickly tap Shift twice to open the command palette. Its default shortcut is Command+P on macOS or Ctrl+P on Windows/Linux; current bindings appear in Settings → Shortcuts.

The palette provides file lookup, full-text search, commands, and settings. Sidebar search finds workspace content; **Find in document** searches the current page.

**Open All Pages** lists Markdown files with title/path search, folder filters, sorting, and view options. Collections include **Needs attention** for broken links, missing assets, or unresolved anchors; **Linked** for connected notes; and **Structured** for notes with multiple headings.

## Sample project status

- [x] Approve the autumn release summary
- [x] Link the installation notes
- [ ] Finish the screenshot captions

Tasks are Markdown content. Checkboxes can be changed in editing mode or as `[ ]` and `[x]` in source mode. The [writing sample](01-Writing.md) includes a status table.

## Page metadata

This page has a title, tags, and status in its frontmatter. The editor offers structured fields and YAML source for metadata at the beginning of a file:

```yaml
---
title: Autumn release
tags: [release, documentation]
status: review
---
```

Custom metadata records information; `status: review` does not trigger a workflow. Metadata also appears when inspecting a node on the [map](02-Links-and-Map.md).

[Guide contents](00-Start-Here.md) · [Workspaces and windows](04-Workspaces.md)
