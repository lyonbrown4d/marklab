---
title: More tools
tags: [guide, tools]
---

# More tools

Get comfortable with [Writing and editing](01-Writing.md), then use diagrams, math, AI, and the terminal as needed.
You can keep writing ordinary Markdown notes without setting these tools up.

## Mermaid diagrams

In source mode, write a fenced code block labeled `mermaid`.
Check the diagram in a rendered view, or insert a Mermaid block from the slash menu.

```mermaid
flowchart LR
    Idea[Idea] --> Draft[Draft]
    Draft --> Review[Review]
```

Edit the Mermaid source to change the diagram.
The preview offers zoom and expand controls. Check the code if you see a syntax error.
Arrows inside the diagram are diagram content; they do not automatically link workspace notes.
For actual note relationships, see [Links and the map](02-Links-and-Map.md).

## Math

Write inline math as `$E = mc^2$`, for example $E = mc^2$.
For a separate equation, surround it with two `$$` lines:

$$
a^2 + b^2 = c^2
$$

You can also choose inline or block math from the slash menu.
Change the equation in source mode, then check the rendered result.

## AI writing assistant

AI needs separate setup. Add an available provider or configure a local model in Settings first.
Select text, choose Ask AI, and request a rewrite, a shorter version, or an explanation.
Review the result before accepting it. You can also stop generation or abandon the suggestion.
Before using a remote provider, review the selected model and privacy information to understand what text is sent.
If no model is configured or a service is unavailable, check the settings indicated by the error.

## Terminal

Use the Open Terminal command or view action to show the terminal panel.
The terminal runs commands on your computer. Check the current path and understand each command before running it.
Choose a default shell in Settings; new or restarted terminal tabs use that setting.
Close the terminal panel when you just want to write in the editor.

## Adjust settings as needed

Settings include appearance, editor behavior, shortcuts, and terminal options.
Change the options you need, then return to your document to check the effect.
See [Sync, history, and export](05-Sync-and-History.md) for connection profiles and workspace bindings.

## Try it

- [ ] Change a node label in the Mermaid diagram above
- [ ] Edit an equation in source mode
- [ ] Check your current shortcuts in Settings
- [ ] Return to [Guide contents](00-Start-Here.md) and choose your next exercise

[Guide contents](00-Start-Here.md) · [Review: Search, tasks, and pages](03-Search-and-Tasks.md)
