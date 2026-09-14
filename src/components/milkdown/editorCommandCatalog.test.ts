import { describe, expect, it } from 'vitest'
import {
  markdownEditorCommandCatalog,
  markdownEditorHeadingShortcutLevels,
  markdownEditorShortcutActionIds,
  markdownEditorSlashCommands,
} from '@/components/milkdown/editorCommandCatalog'
import { isShortcutActionId, resolveShortcutBindings } from '@/logic/shortcuts'

describe('markdown editor command catalog', () => {
  it.each([1, 2, 3, 4, 5, 6] as const)('keeps Mod+%i for its Markdown heading', (level) => {
    const action = `editor.heading${level}` as const
    expect(resolveShortcutBindings({})[action]).toEqual([`Mod+${level}`])
    expect(markdownEditorHeadingShortcutLevels[action]).toBe(level)
  })

  it('keeps existing Typora-style writing defaults without registering another keymap', () => {
    const bindings = resolveShortcutBindings({})
    expect(bindings['editor.paragraph']).toEqual(['Mod+0'])
    expect(bindings['editor.codeBlock']).toEqual(['Control+Shift+K', 'Meta+Alt+C'])
    expect(bindings['editor.quote']).toEqual(['Control+Shift+Q', 'Meta+Alt+Q'])
    expect(bindings['editor.bold']).toEqual(['Mod+B'])
    expect(bindings['editor.italic']).toEqual(['Mod+I'])
    expect(bindings['editor.link']).toEqual(['Mod+K'])
    expect(bindings['editor.clearFormat']).toEqual(['Mod+\\'])
  })

  it('preserves custom or disabled bindings while keeping the optional slash commands', () => {
    const overrides = { 'editor.codeBlock': ['Mod+Shift+X'], 'editor.quote': [] }
    const bindings = resolveShortcutBindings(overrides)
    expect(bindings['editor.codeBlock']).toEqual(['Mod+Shift+X'])
    expect(bindings['editor.quote']).toEqual([])
    expect(
      markdownEditorSlashCommands.find((command) => command.key === 'codeBlock')?.actionId,
    ).toBe('editor.codeBlock')
    expect(markdownEditorSlashCommands.find((command) => command.key === 'quote')?.actionId).toBe(
      'editor.quote',
    )
    expect(overrides).toEqual({ 'editor.codeBlock': ['Mod+Shift+X'], 'editor.quote': [] })
  })

  it.each(['link', 'image-url'])('keeps /%s searchable independently of locale', (key) => {
    expect(markdownEditorSlashCommands.find((command) => command.key === key)?.aliases).toContain(
      key,
    )
  })

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
        'editor.bold',
        'editor.italic',
        'editor.inlineCode',
        'editor.strike',
        'editor.link',
        'editor.clearFormat',
        'editor.bulletList',
        'editor.orderedList',
        'editor.image',
        'editor.codeBlock',
        'editor.table',
      ]),
    )
  })
})
