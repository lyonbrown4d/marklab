import { describe, expect, it } from 'vitest'
import {
  markdownEditorCommandCatalog,
  markdownEditorHeadingShortcutLevels,
  markdownEditorShortcutActionIds,
  markdownEditorSlashCommands,
} from '@/components/milkdown/editorCommandCatalog'
import { isShortcutActionId } from '@/logic/shortcuts'

describe('markdown editor command catalog', () => {
  it('keeps command ids, shortcut actions, and slash keys unique', () => {
    const commandIds = markdownEditorCommandCatalog.map((command) => command.id)
    const shortcutActions = markdownEditorShortcutActionIds
    const slashKeys = markdownEditorSlashCommands.map((command) => command.key)

    expect(new Set(commandIds).size).toBe(commandIds.length)
    expect(new Set(shortcutActions).size).toBe(shortcutActions.length)
    expect(new Set(slashKeys).size).toBe(slashKeys.length)
  })

  it('only exposes valid shortcut action ids to the editor shortcut layer', () => {
    expect(markdownEditorShortcutActionIds.every(isShortcutActionId)).toBe(true)
    expect(markdownEditorShortcutActionIds).not.toContain('editor.divider')
    expect(markdownEditorShortcutActionIds).not.toContain('editor.taskList')
  })

  it('keeps heading shortcuts mapped to their markdown heading levels', () => {
    expect(markdownEditorHeadingShortcutLevels).toEqual({
      'editor.heading1': 1,
      'editor.heading2': 2,
      'editor.heading3': 3,
      'editor.heading4': 4,
      'editor.heading5': 5,
      'editor.heading6': 6,
    })
  })

  it('declares slash commands for the block commands that overlap with shortcuts', () => {
    const slashActionIds = new Set(
      markdownEditorSlashCommands.flatMap((command) => command.actionId ?? []),
    )

    expect(slashActionIds).toEqual(
      new Set([
        'editor.paragraph',
        'editor.heading1',
        'editor.heading2',
        'editor.heading3',
        'editor.heading4',
        'editor.heading5',
        'editor.heading6',
        'editor.quote',
        'editor.bulletList',
        'editor.orderedList',
        'editor.image',
        'editor.codeBlock',
        'editor.table',
      ]),
    )
  })
})
