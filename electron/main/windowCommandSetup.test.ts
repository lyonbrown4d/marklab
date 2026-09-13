import { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWindowCommandSetup } from '@electron/main/windowCommandSetup.js'
import { createAppWindowCommandHandlers } from '@electron/main/windowCommands.js'

vi.mock('electron', () => ({ BrowserWindow: { getFocusedWindow: vi.fn() } }))
vi.mock('@electron/main/windowCommands.js', () => ({
  createAppWindowCommandHandlers: vi.fn(() => ({})),
  createNativeMenuActionDispatcher: vi.fn(() => vi.fn()),
}))
vi.mock('@electron/services/settingsStore.js', () => ({
  copyRendererPersistSession: vi.fn(),
  writeRendererPersistSession: vi.fn(),
}))

const createWindow = (destroyed = false) =>
  ({
    isDestroyed: () => destroyed,
  }) as unknown as BrowserWindow

const createHarness = (primary: BrowserWindow | null) => {
  const root = { kind: 'external' as const, path: '/workspace' }
  const rootInfoForWindow = vi.fn(() => root)
  const options = {
    getContainer: () => ({ cradle: { workspaceRegistry: { rootInfoForWindow } } }),
    getNativeIpc: () => null,
    getPrimaryWindow: () => primary,
    getWindowPool: vi.fn(),
    installManagedMainWindowLifecycle: vi.fn(),
  } as unknown as Parameters<typeof createWindowCommandSetup>[0]
  createWindowCommandSetup(options)
  const dependencies = vi.mocked(createAppWindowCommandHandlers).mock.calls[0][0]
  return { dependencies, root, rootInfoForWindow }
}

beforeEach(() => {
  vi.mocked(createAppWindowCommandHandlers).mockClear()
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
})

describe('window command workspace selection', () => {
  it('uses the focused window when present', () => {
    const focused = createWindow()
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(focused)
    const { dependencies, root, rootInfoForWindow } = createHarness(createWindow())
    expect(dependencies.getCurrentWorkspaceRoot()).toEqual(root)
    expect(rootInfoForWindow).toHaveBeenCalledWith(focused)
  })

  it('falls back to the primary window when none is focused', () => {
    const primary = createWindow()
    const { dependencies, root, rootInfoForWindow } = createHarness(primary)
    expect(dependencies.getCurrentWorkspaceRoot()).toEqual(root)
    expect(rootInfoForWindow).toHaveBeenCalledWith(primary)
  })

  it.each([null, createWindow(true)])(
    'rejects missing or destroyed windows without registry access',
    (primary) => {
      const { dependencies, rootInfoForWindow } = createHarness(primary)
      expect(() => dependencies.getCurrentWorkspaceRoot()).toThrow('No active workspace window')
      expect(rootInfoForWindow).not.toHaveBeenCalled()
    },
  )
})
