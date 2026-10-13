---
title: Sync, history, and export
tags: [guide, sync]
---

# Sync, history, and export

WebDAV synchronizes a local workspace with a remote folder.
Local history lets you inspect earlier saved versions; export produces documents to share.
Before syncing, make sure you have opened a [folder workspace](04-Workspaces.md).

## Step 1: add a WebDAV connection

1. Open Settings → Sync & storage.
2. Add a connection with its name, server address, base path, and authentication details.
3. Test the connection, check the result, then save it.

Connection profiles are reusable, but each workspace needs its own binding.
With session-only credentials, you need to authenticate again after closing Marklab.
Keep passwords and app tokens out of your notes.

## Step 2: bind this workspace

1. Open the WebDAV binding configuration from the workspace menu or sync center.
2. Select your saved connection.
3. Set the remote folder for this workspace and confirm the binding.
4. Open the sync center and choose Sync WebDAV now.

Watch progress, completion, and errors. Cancel the operation if needed.
After binding, check sync results explicitly. A local save alone does not mean a file has synced.
If the connection fails, check the configuration and network, then retry.

## Resolve a conflict

The sync center reports conflicts when both sides edit a file or a deletion conflicts with an edit.
Open Resolve sync conflicts, select each file, and compare Current local version with Saved remote version.
The remote conflict copy is kept. Replaced local content is backed up before replacement.
The dialog shows the saved remote copy's path so you can inspect it.

- Keep local: choose Use current local version.
- Keep remote: choose Use saved remote version.
- Merge: edit the local file to combine the content, then choose Use current local version.

Your choice takes effect locally immediately. Sync again to apply it to the remote folder.
Choosing a deleted version deletes the document and requires confirmation.
Inspect binary or large files directly when a text preview is unavailable.
If versions change or resolution fails, refresh the versions and compare again.

## Local history

Open the file's Timeline, select a saved version, and preview it against the current file.
Choose Restore after checking the comparison; the saved version replaces the current file.
Deleting a version or clearing the timeline permanently removes those history entries.
An empty timeline means there are currently no local history versions to restore.

## Export a document or workspace

Export the current document to PDF, Word, or HTML.
Choose an output location and wait for completion. Check errors if any; you can cancel an ongoing export.
To combine several notes into one document, use Export Workspace.
Select chapters, adjust their order, check the preview, then choose format, paper, margins, and other settings before exporting.
Exported documents are for reading or sharing; they do not replace your Markdown files.

## Check your results

- [ ] Check whether sync finished or needs conflict resolution
- [ ] Sync again after resolving conflicts
- [ ] Compare content before restoring history
- [ ] Open the exported file to check the result

[Guide contents](00-Start-Here.md) · [Next: More tools](06-More-Tools.md)
