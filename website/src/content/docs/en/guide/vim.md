---
title: Vim mode
description: Set a global default or enable Vim for a single tab.
---

Vim works in source editors: Markdown source, code files, expanded code-block editors, and Mermaid source. Rich-text paragraphs keep their usual editing behavior.

## Enable Vim

- **Global default:** enable Vim under Settings → Editing → Source editor.
- **Current tab:** use the Vim button in the bottom status bar to follow the global default, enable, or disable Vim.

A tab override lasts for that open tab's session and is cleared when the tab closes.

## Modes and commands

The status bar shows Normal, Insert, and Visual modes. It also hosts `:` commands and `/` or `?` searches. Press Escape to return to Normal or cancel an input.

When the status bar is hidden, input stays below the editor. Code-block dialogs keep their input inside the dialog.

## Save and close

| Command        | Behavior                                        |
| -------------- | ----------------------------------------------- |
| `:w`, `:write` | Save the current content                        |
| `:q`, `:quit`  | Handle pending saves, then close the source tab |
| `:wq`, `:x`    | Save successfully, then close the tab           |

A failed save prevents the subsequent close. Code-block dialogs ask you to save unapplied changes first; Mermaid's close command ends source editing.

## Shortcuts

While a Vim editor has focus, Vim bindings take priority. App shortcuts resume outside that editor. Read-only editors do not enable bindings that modify content.
