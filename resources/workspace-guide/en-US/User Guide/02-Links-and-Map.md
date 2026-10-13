---
title: Links and the map
tags: [guide, links]
---

# Links and the map

A link takes you from one note to another.
The map shows workspace files and their connections so you can follow context as you read.
The links between these guide chapters are ready-to-explore examples.

## Write a relative link

For pages in the same folder, use the target filename:

```markdown
[Writing and editing](01-Writing.md)
```

Here is the working link: [Writing and editing](01-Writing.md).
Paths are relative to the current file's folder, not the app's installation folder.
You can change the link text; the path in parentheses must point to a real file.
Use `%20` for spaces in filenames.

## Connect different folders

`../` means the parent folder. For a note in a subfolder,
use `../` followed by the target filename or folder path to reach a note above it.
After moving or renaming files, check existing links for broken paths.
Ordinary relative Markdown links connect pages without additional setup.

## Follow a link

In editing or source mode, hold Ctrl (Windows/Linux) or Command (macOS) while clicking a link to open its target.
A plain click in editing mode is for editing. Workspace links still require Ctrl or Command while read-only browsing is enabled.
Check the tab and file path afterward to confirm that you opened the intended page.

## Explore the map

1. Click Map at the top to open the workspace map.
2. Find the nodes for the guide pages.
3. Select a node to inspect its path, links, and Markdown metadata.
4. Double-click an openable file node to visit its page.
5. Return to Files to keep writing.

Use the map to explore relationships and the file list to navigate folders.
Notes can exist without links. You do not need a connection for every page.

## Try it: inspect a real connection

Open [Search, tasks, and pages](03-Search-and-Tasks.md), then return here.
The link from this page to that chapter creates a relationship the map can recognize.
Try adding a relative link from one of your own notes to another.

- [ ] Open the target page to verify the link
- [ ] Find the related nodes on the map
- [ ] Check that the page paths are correct

[Guide contents](00-Start-Here.md) · [Next: Search, tasks, and pages](03-Search-and-Tasks.md)
