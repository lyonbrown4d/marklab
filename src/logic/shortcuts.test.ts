import { matchesKeyboardEvent, validateHotkey, type HotkeyChord } from '@tanstack/react-hotkeys'
import { describe, expect, it } from 'vitest'
import {
  defaultShortcutBindings,
  detectShortcutConflicts,
  matchesShortcutAction,
  resolveShortcutBindings,
  sanitizeShortcutOverrides,
  shortcutActions,
  shortcutCategories,
} from '@/logic/shortcuts'
import { markdownEditorShortcutActionIds } from '@/components/editor/editorCommandCatalog'
import enUS from '@/i18n/locales/en-US.json'
import zhCN from '@/i18n/locales/zh-CN.json'

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
      expect(zhCN).toHaveProperty(action.labelKey)
    })
    shortcutCategories.forEach((category) => {
      expect(enUS).toHaveProperty(category.labelKey)
      expect(zhCN).toHaveProperty(category.labelKey)
    })
  })

  it('keeps default bindings valid for TanStack Hotkeys', () => {
    shortcutActions.forEach((action) => {
      defaultShortcutBindings[action.id].forEach((binding) => {
        expect(validateHotkey(binding), binding).toMatchObject({ valid: true })
      })
    })
  })

  it('provides a configurable terminal toggle shortcut', () => {
    expect(defaultShortcutBindings['view.toggleTerminal']).toEqual(['Mod+J'])
    expect(shortcutCategories.find((category) => category.id === 'workspace')?.actions).toContain(
      'view.toggleTerminal',
    )
  })

  it('keeps inline AI customizable without claiming the terminal shortcut', () => {
    expect(defaultShortcutBindings['view.toggleTerminal']).toEqual(['Mod+J'])
    expect(defaultShortcutBindings['editor.inlineAiComposer']).toEqual(['Mod+Shift+J'])
    expect(shortcutCategories.find((category) => category.id === 'editor')?.actions).toContain(
      'editor.inlineAiComposer',
    )

    const defaultEvent = new KeyboardEvent('keydown', {
      ctrlKey: true,
      key: 'J',
      shiftKey: true,
    })
    const terminalEvent = new KeyboardEvent('keydown', { ctrlKey: true, key: 'J' })
    const customEvent = new KeyboardEvent('keydown', { key: 'F8' })

    expect(matchesShortcutAction(defaultEvent, 'editor.inlineAiComposer', {}, 'windows')).toBe(true)
    expect(matchesShortcutAction(terminalEvent, 'editor.inlineAiComposer', {}, 'windows')).toBe(
      false,
    )
    expect(
      matchesShortcutAction(
        defaultEvent,
        'editor.inlineAiComposer',
        {
          'editor.inlineAiComposer': ['F8'],
        },
        'windows',
      ),
    ).toBe(false)
    expect(
      matchesShortcutAction(
        customEvent,
        'editor.inlineAiComposer',
        {
          'editor.inlineAiComposer': ['F8'],
        },
        'windows',
      ),
    ).toBe(true)
    expect(
      matchesShortcutAction(
        customEvent,
        'editor.inlineAiComposer',
        {
          'editor.inlineAiComposer': [],
        },
        'windows',
      ),
    ).toBe(false)
  })

  it('keeps the command palette available through Ctrl/Cmd+P', () => {
    expect(defaultShortcutBindings['app.commandPalette']).toEqual(['Mod+P'])
  })

  it.each(['mac', 'windows', 'linux'] as const)(
    'matches settings and sidebar shortcuts with the native modifier on %s',
    (platform) => {
      for (const [action, key, code, shiftKey] of [
        ['app.settings', ',', 'Comma', false],
        ['view.toggleSidebar', 'L', 'KeyL', true],
        ['view.toggleRightSidebar', 'R', 'KeyR', true],
      ] as const) {
        const binding = defaultShortcutBindings[action][0] as HotkeyChord
        const event = new KeyboardEvent('keydown', {
          key,
          code,
          shiftKey,
          ctrlKey: platform !== 'mac',
          metaKey: platform === 'mac',
        })
        expect(matchesKeyboardEvent(event, binding, platform)).toBe(true)
        expect(
          matchesKeyboardEvent(
            new KeyboardEvent('keydown', { key, code, shiftKey }),
            binding,
            platform,
          ),
        ).toBe(false)
      }
    },
  )

  it('provides a quick read-only browsing shortcut', () => {
    expect(defaultShortcutBindings['view.toggleReadonly']).toEqual(['Mod+Shift+E'])
    expect(shortcutCategories.find((category) => category.id === 'workspace')?.actions).toEqual(
      expect.arrayContaining(['view.toggleReadonly']),
    )
  })

  it('provides a shortcut for the bottom status bar', () => {
    expect(defaultShortcutBindings['view.toggleStatusBar']).toEqual(['Mod+Shift+B'])
  })

  it('keeps formatting shortcut consumers aligned with their editor actions', () => {
    const editorActionIds = shortcutActions
      .filter((action) => action.scope === 'editor')
      .map((action) => action.id)
      .sort()

    expect(editorActionIds).toEqual(
      [...markdownEditorShortcutActionIds, 'editor.inlineAiComposer'].sort(),
    )
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
