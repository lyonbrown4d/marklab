import { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createNativeMenuActionDispatcher,
  type AppWindowCommandDependencies,
} from '@electron/main/windowCommands'

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn(), getFocusedWindow: vi.fn() },
}))
vi.mock('@electron/windowMotion', () => ({ showWindowWithMotion: vi.fn() }))

const createWindow = () => ({ webContents: { send: vi.fn() } }) as unknown as BrowserWindow

const createDependencies = (primary: BrowserWindow | null, dispatchToWindow = vi.fn(() => false)) =>
  ({
    getNativeIpc: () => ({ menu: { dispatchToWindow } }),
    getPrimaryWindow: () => primary,
  }) as unknown as AppWindowCommandDependencies

beforeEach(() => vi.clearAllMocks())

describe('native menu action dispatcher', () => {
  it('routes the new-window action through the typed command handler', () => {
    const openCurrent = vi.fn(async () => ({ ok: true }))
    const dispatch = createNativeMenuActionDispatcher(createDependencies(null), {
      open_current_workspace_in_new_window: openCurrent,
    } as never)

    dispatch('window.open_current_workspace_in_new_window')

    expect(openCurrent).toHaveBeenCalledWith(undefined, null)
  })

  it('lets native IPC consume an action for the focused window', () => {
    const focused = createWindow()
    const primary = createWindow()
    const dispatchToWindow = vi.fn(() => true)
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(focused)
    const dispatch = createNativeMenuActionDispatcher(
      createDependencies(primary, dispatchToWindow),
      {} as never,
    )

    dispatch('edit.copy')

    expect(dispatchToWindow).toHaveBeenCalledWith(focused, 'edit.copy')
    expect(focused.webContents.send).not.toHaveBeenCalled()
  })

  it('falls back to the primary renderer when native IPC declines an action', () => {
    const primary = createWindow()
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
    const dispatch = createNativeMenuActionDispatcher(createDependencies(primary), {} as never)

    dispatch('edit.paste')

    expect(primary.webContents.send).toHaveBeenCalledWith('menu-action', 'edit.paste')
  })

  it('safely ignores an action when no window or native IPC bridge exists', () => {
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
    const dependencies = {
      getNativeIpc: () => null,
      getPrimaryWindow: () => null,
    } as unknown as AppWindowCommandDependencies

    expect(() => createNativeMenuActionDispatcher(dependencies)('edit.undo')).not.toThrow()
  })
})
