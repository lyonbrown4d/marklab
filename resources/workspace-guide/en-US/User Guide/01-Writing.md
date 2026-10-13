---
title: Writing and editing
tags: [guide, writing]
---

# Writing and editing

Open a Markdown file from the sidebar. The workspace menu provides the new-file action; creating files requires a [workspace folder](04-Workspaces.md).

## Editor modes

**Editing mode** shows formatted text while you write. **Source mode** exposes the Markdown. **Read-only browsing** displays the page without editing. The document view controls switch modes.

On an empty line, `/` opens the block menu for headings, lists, tables, code, [diagrams, and math](06-More-Tools.md).

## Sample note: Autumn release

The release draft is **ready for review**. The _installation section_ still needs screenshots.

- [x] Finish the release summary
- [x] Review the migration notes
- [ ] Add installation screenshots

> Keep the summary short enough to read before downloading.

| Section         | Owner | Status              |
| --------------- | ----- | ------------------- |
| Release summary | Maya  | Approved            |
| Installation    | Theo  | Screenshots pending |

```typescript
const release = { version: '1.4', status: 'review' }
```

## Images and saves

Pasting or dropping an image imports it into the workspace. The save status shows whether changes reached disk; a save error leaves content unsaved. Earlier saved versions are available in [local history](05-Sync-and-History.md).

[Guide contents](00-Start-Here.md) · [Links and the map](02-Links-and-Map.md)
