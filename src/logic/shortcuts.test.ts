import { validateHotkey } from '@tanstack/react-hotkeys'
import { describe, expect, it } from 'vitest'
import {
  defaultShortcutBindings,
  detectShortcutConflicts,
  resolveShortcutBindings,
  sanitizeShortcutOverrides,
  shortcutActions,
} from '@/logic/shortcuts'

describe('shortcuts', () => {
  it('keeps default bindings valid for TanStack Hotkeys', () => {
    shortcutActions.forEach((action) => {
      defaultShortcutBindings[action.id].forEach((binding) => {
        expect(validateHotkey(binding), binding).toMatchObject({ valid: true })
      })
    })
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
