import { describe, expect, it, vi } from 'vitest'
import {
  appActionCatalog,
  createAppActionPresentations,
  isAppActionId,
  isDispatchableAppActionId,
  nonDispatchableAppActionIds,
  resolveAppActionShortcut,
  runAppAction,
  type AppActionId,
  type AppActionHandlers,
} from '@/logic/appActionCatalog'

describe('appActionCatalog', () => {
  it('creates localized presentations with resolved shortcuts and availability', () => {
    const presentations = createAppActionPresentations({
      canCreateWorkspaceEntries: false,
      shortcutOverrides: { 'file.openFile': ['Mod+Alt+O'] },
      translate: (key) => `translated:${key}`,
    })

    expect(presentations['file.open_file']).toMatchObject({
      enabled: true,
      label: 'translated:actions.openFile',
      shortcut: expect.stringContaining('O'),
    })
    expect(presentations['file.new']).toMatchObject({
      enabled: false,
      label: 'translated:sidebar.newFile',
    })
  })

  it('keeps every catalog identifier discoverable at runtime', () => {
    Object.keys(appActionCatalog).forEach((id) => expect(isAppActionId(id)).toBe(true))
    expect(isAppActionId('collection.open:daily')).toBe(false)
  })

  it('classifies every static action as dispatchable or explicitly excluded', () => {
    const catalogIds = Object.keys(appActionCatalog) as AppActionId[]
    const dispatchableIds = catalogIds.filter(isDispatchableAppActionId)
    const classified = [...dispatchableIds, ...nonDispatchableAppActionIds]

    expect(new Set(classified).size).toBe(classified.length)
    expect(classified.sort()).toEqual(Object.keys(appActionCatalog).sort())
    expect(nonDispatchableAppActionIds).toEqual(['app.command_palette'])
  })

  it('resolves shortcut presentation through catalog metadata', () => {
    expect(
      resolveAppActionShortcut(
        'app.command_palette',
        { 'app.commandPalette': ['Mod+Alt+P'] },
        'windows',
      ),
    ).toContain('P')
  })

  it('omits shortcut text when a user clears an action binding', () => {
    const presentations = createAppActionPresentations({
      canCreateWorkspaceEntries: true,
      shortcutOverrides: { 'tab.close': [] },
      translate: (key) => key,
    })

    expect(presentations['tab.close'].shortcut).toBeUndefined()
  })

  it('runs only registered, enabled actions', () => {
    const openFile = vi.fn()
    const handlers = {
      'file.export_docx': vi.fn(),
      'file.export_html': vi.fn(),
      'file.export_pdf': vi.fn(),
      'file.new': vi.fn(),
      'file.new_folder': vi.fn(),
      'file.open_file': openFile,
      'file.open_project': vi.fn(),
      'help.about': vi.fn(),
      'settings.open': vi.fn(),
      'tab.close': vi.fn(),
      'view.focus_file_search': vi.fn(),
      'view.source': vi.fn(),
      'view.toggle_readonly': vi.fn(),
      'view.toggle_right_sidebar': vi.fn(),
      'view.toggle_sidebar': vi.fn(),
      'view.toggle_status_bar': vi.fn(),
      'view.wysiwyg': vi.fn(),
      'window.open_current_workspace_in_new_window': vi.fn(),
    } satisfies AppActionHandlers

    expect(runAppAction('file.open_file', handlers, true)).toBe(true)
    expect(runAppAction('file.open_file', handlers, false)).toBe(false)
    expect(openFile).toHaveBeenCalledTimes(1)
  })
})
