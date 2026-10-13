---
title: Workspaces and windows
tags: [guide, workspace]
---

# Workspaces and windows

A workspace sets the scope for files, search, and the [map](02-Links-and-Map.md).

| Mode              | Scope                                                    |
| ----------------- | -------------------------------------------------------- |
| Default workspace | Local starting folder, with this guide on first use      |
| Folder workspace  | An existing or newly created folder for notes and assets |
| Single-file mode  | One file for reading or editing                          |

Single-file mode has no workspace file/folder creation or [WebDAV binding](05-Sync-and-History.md).

## Open and create

The workspace menu contains **New Workspace**, **Open Workspace**, and **Open File**. New Workspace creates a named folder under a chosen parent; it does not overwrite an existing folder. Opening a folder uses it in place.

A normal open action switches the current window. **Open Workspace in New Window** opens another folder separately; **Open Current Workspace in New Window** opens the same folder again. Editing the same file in both windows can produce disk-change and save messages.

## Recently opened

The workspace menu lists recent locations and marks unavailable paths. Removing an entry clears only the recent record; files remain on disk.

## Restore a workspace

Marklab restores the previous workspace and session at startup. If a path is unavailable, the recovery page offers **Retry restore**, **Locate workspace**, **Open another workspace**, and **Return to default workspace**.

[Guide contents](00-Start-Here.md) · [Search and pages](03-Search-and-Tasks.md) · [Workspace home](../Home.md)
