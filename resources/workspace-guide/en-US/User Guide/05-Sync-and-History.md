---
title: Sync, history, and export
tags: [guide, sync]
---

# Sync, history, and export

## WebDAV sync

Add and test a connection in **Settings → Sync & storage**. Then bind a [folder workspace](04-Workspaces.md) to that connection and a remote folder through the workspace menu or sync center.

**Sync WebDAV now** starts synchronization. The sync center shows progress, errors, and conflicts. Saving locally does not mean the remote copy has updated. Session-only credentials require authentication again after closing Marklab.

## Conflicts

**Resolve sync conflicts** compares the current local version with the saved remote version. Choose either version, or edit the local file to merge their content and keep it.

Replaced local content is backed up, and the remote conflict copy is retained. The choice takes effect locally; another sync applies it remotely. Choosing a deleted version deletes the document and requires confirmation.

## Local history

The file's **Timeline** previews saved versions against the current file. **Restore** replaces the current content with the selected version. Deleting versions or clearing the timeline permanently removes those history entries.

## Export

Export the current document as **PDF, Word, or HTML**. **Export Workspace** combines selected notes: chapter order, preview, paper size, margins, and format are configurable. Export creates a separate document while the Markdown files remain in the workspace.

The [writing sample](01-Writing.md) contains formatted text and a table; [More tools](06-More-Tools.md) includes diagrams and equations.

[Guide contents](00-Start-Here.md)
