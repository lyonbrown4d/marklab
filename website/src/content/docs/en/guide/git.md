---
title: Git and conflicts
description: Review changes, save versions, and resolve conflicts in your workspace.
---

Install Git locally and open a workspace that is a Git repository. Remote operations use your existing Git authentication configuration.

## Review and commit

Choose **Source Control** in the workspace menu, or use the Git button in the bottom status bar.

1. Select a changed file to review its diff.
2. Stage the files you want to commit.
3. Enter a message and commit the staged changes.
4. Configure a remote to fetch, pull, or push as needed.

Git status refreshes automatically while the workspace is in the foreground, and after repository operations.

![Git text diff view](../../../../assets/app-git.png)

## History, branches, and Stash

The repository dialog provides commit history, branches, and Stash. Review earlier changes, switch branches, or set aside unfinished work.

Resetting and discarding changes can alter files. Check the confirmation's scope first. Reset operations preserve a recoverable backup branch.

## Resolve conflicts

Conflicted files open in the diff merge view. Choose content to retain, edit the result, and save it. When resolved, save and stage the file.

If another tool changes the file or conflict state, reload it before continuing so later changes are preserved.

## Images and other files

Supported types use the built-in preview or editor. Other files can open in the operating system's default app.

Staged and historical files use the corresponding read-only versions. Binary conflicts stay out of the text merge editor; resolve them with an appropriate tool before staging.
