import { validateHotkey } from '@tanstack/react-hotkeys'
import { describe, expect, it } from 'vitest'
import {
  defaultShortcutBindings,
  detectShortcutConflicts,
  resolveShortcutBindings,
  sanitizeShortcutOverrides,
  shortcutActions,
  shortcutCategories,
} from '@/logic/shortcuts'
import { graphShortcutActions } from '@/pages/graphKeyboardActions'
import { markdownEditorShortcutActionIds } from '@/components/milkdown/editorCommandCatalog'
import enUS from '@/i18n/locales/en-US.json'

describe('shortcuts', () => {
  it('keeps each shortcut action wired to defaults, categories, and translations', () => {
    const actionIds = shortcutActions.map((action) => action.id)
    const defaultActionIds = Object.keys(defaultShortcutBindings)
    const categorizedActionIds = shortcutCategories.flatMap((category) => category.actions)

    expect(new Set(actionIds).size).toBe(actionIds.length)
    expect(defaultActionIds.sort()).toEqual([...actionIds].sort())
    expect(categorizedActionIds.sort()).toEqual([...actionIds].sort())
    shortcutActions.forEach((action) => {
      expect(enUS).toHaveProperty(action.labelKey)
    })
    shortcutCategories.forEach((category) => {
      expect(enUS).toHaveProperty(category.labelKey)
    })
  })

  it('keeps default bindings valid for TanStack Hotkeys', () => {
    shortcutActions.forEach((action) => {
      defaultShortcutBindings[action.id].forEach((binding) => {
        expect(validateHotkey(binding), binding).toMatchObject({ valid: true })
      })
    })
  })

  it('keeps scoped shortcut consumers aligned with the action catalog', () => {
    const graphActionIds = shortcutActions
      .filter((action) => action.scope === 'graph')
      .map((action) => action.id)
      .sort()
    const editorActionIds = shortcutActions
      .filter((action) => action.scope === 'editor')
      .map((action) => action.id)
      .sort()

    expect(graphShortcutActions.map(([action]) => action).sort()).toEqual(graphActionIds)
    expect([...markdownEditorShortcutActionIds].sort()).toEqual(editorActionIds)
  })

  it('supports clearing a shortcut through persisted overrides', () => {
    const bindings = resolveShortcutBindings({ 'tab.close': [] })

    expect(bindings['tab.close']).toEqual([])
  })

  it('drops invalid persisted shortcuts', () => {
    const overrides = sanitizeShortcutOverrides({
      'app.commandPalette': ['Mod+P', 'Not+A+Shortcut'],
    })

    expect(overrides['app.commandPalette']).toEqual(['Mod+P'])
  })

  it('reports conflicting shortcuts', () => {
    const overrides = sanitizeShortcutOverrides({
      'editor.bold': ['Mod+B'],
      'editor.italic': ['Mod+I'],
      'editor.quote': ['Mod+B'],
    })
    const resolved = resolveShortcutBindings(overrides)
    const conflicts = detectShortcutConflicts(resolved)

    expect(conflicts['editor.bold']).toEqual(['editor.quote'])
    expect(conflicts['editor.quote']).toEqual(['editor.bold'])
    expect(conflicts['editor.italic']).toBeUndefined()
  })
})
