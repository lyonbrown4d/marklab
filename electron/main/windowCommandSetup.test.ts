import { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createWindowCommandSetup } from '@electron/main/windowCommandSetup'
import { createAppWindowCommandHandlers } from '@electron/main/windowCommands'
import { createNativeMenuActionDispatcher } from '@electron/main/windowCommands'
import { noopLogger } from '@electron/services/logger'
import {
  copyRendererPersistSession,
  writeRendererPersistSession,
} from '@electron/services/settingsStore'
import type { MarklabWindowPool } from '@electron/windowPool'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'
import { activateWorkspaceWindowState } from '@electron/windowStateRestore'

const commandHandlers = vi.hoisted(() => ({
  open_path_in_current_window: vi.fn(),
  open_path_in_new_window: vi.fn(),
}))
const openStartupPathInCurrentWindow = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({ BrowserWindow: { getFocusedWindow: vi.fn() } }))
vi.mock('@electron/main/windowCommands', () => ({
  createAppWindowCommandHandlers: vi.fn(() => commandHandlers),
  createNativeMenuActionDispatcher: vi.fn(() => vi.fn()),
  openStartupPathInCurrentWindow,
}))
vi.mock('@electron/services/settingsStore', () => ({
  copyRendererPersistSession: vi.fn(),
  writeRendererPersistSession: vi.fn(),
}))
vi.mock('@electron/windowStateRestore', () => ({ activateWorkspaceWindowState: vi.fn() }))

const createWindow = (destroyed = false) =>
  ({
    isDestroyed: () => destroyed,
  }) as unknown as BrowserWindow

const createHarness = (primary: BrowserWindow | null) => {
  const root = { kind: 'external' as const, path: '/workspace' }
  const registeredService = { rootInfo: vi.fn() } as unknown as WorkspaceService
  const registerWindow = vi.fn(() => registeredService)
  const rootInfoForWindow = vi.fn(() => root)
  const sessionKeyForWindow = vi.fn(() => 'test-session')
  const windowPool = {} as MarklabWindowPool
  const installManagedMainWindowLifecycle = vi.fn()
  const isPrimaryWindowBootstrapping = vi.fn(() => true)
  const presentPrimaryWindow = vi.fn()
  const options = {
    getServices: () => ({
      logger: noopLogger,
      workspaceRegistry: {
        registerWindow,
        rootInfoForWindow,
        sessionKeyForWindow,
      },
    }),
    getNativeIpc: () => null,
    getPrimaryWindow: () => primary,
    getWindowPool: () => windowPool,
    installManagedMainWindowLifecycle,
    isPrimaryWindowBootstrapping,
    presentPrimaryWindow,
  } satisfies Parameters<typeof createWindowCommandSetup>[0]
  const setup = createWindowCommandSetup(options)
  const dependencies = vi.mocked(createAppWindowCommandHandlers).mock.calls[0][0]
  return {
    dependencies,
    installManagedMainWindowLifecycle,
    isPrimaryWindowBootstrapping,
    presentPrimaryWindow,
    primary,
    registeredService,
    registerWindow,
    root,
    rootInfoForWindow,
    sessionKeyForWindow,
    setup,
    windowPool,
  }
}

beforeEach(() => {
  vi.mocked(createAppWindowCommandHandlers).mockClear()
  commandHandlers.open_path_in_current_window.mockClear()
  commandHandlers.open_path_in_new_window.mockClear()
  openStartupPathInCurrentWindow.mockClear()
  vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(null)
  vi.mocked(copyRendererPersistSession).mockClear()
  vi.mocked(writeRendererPersistSession).mockClear()
  vi.mocked(activateWorkspaceWindowState).mockClear()
})

describe('window command workspace selection', () => {
  it('routes native paths according to the requested window disposition', async () => {
    const setup = createWindowCommandSetup({
      getServices: () => ({
        logger: noopLogger,
        workspaceRegistry: {
          registerWindow: vi.fn(),
          rootInfoForWindow: vi.fn(),
          sessionKeyForWindow: vi.fn(() => 'test-session'),
        },
      }),
      getNativeIpc: () => null,
      getPrimaryWindow: () => createWindow(),
      getWindowPool: () => ({}) as MarklabWindowPool,
      installManagedMainWindowLifecycle: vi.fn(),
      isPrimaryWindowBootstrapping: vi.fn(() => true),
      presentPrimaryWindow: vi.fn(),
    })

    await setup.openSystemPath('C:/notes/current.md', 'current')
    const controller = new AbortController()
    await setup.openSystemPath('C:/notes/startup.md', 'current', {
      signal: controller.signal,
      startup: true,
    })
    await setup.openSystemPath('C:/notes/new.md', 'new')

    expect(commandHandlers.open_path_in_current_window).toHaveBeenCalledWith(
      { path: 'C:/notes/current.md' },
      null,
    )
    expect(commandHandlers.open_path_in_new_window).toHaveBeenCalledWith(
      { path: 'C:/notes/new.md' },
      null,
    )
    expect(openStartupPathInCurrentWindow).toHaveBeenCalledWith(
      expect.any(Object),
      { path: 'C:/notes/startup.md' },
      { signal: controller.signal },
    )
  })

  it('shares command handlers with native-menu opens so failed targets remain retryable', () => {
    createHarness(createWindow())

    expect(createNativeMenuActionDispatcher).toHaveBeenCalledWith(
      expect.any(Object),
      vi.mocked(createAppWindowCommandHandlers).mock.results[0].value,
    )
  })

  it('wires workspace lifecycle dependencies through the setup boundary', () => {
    const primary = createWindow()
    const harness = createHarness(primary)
    const overrides = { activeTabId: 'notes' }
    const state = { tabs: [] }

    harness.dependencies.activateWorkspaceWindowState(primary, harness.root)
    harness.dependencies.copyWorkspaceSession('source', 'target', overrides)
    expect(harness.dependencies.getLogger()).toBe(noopLogger)
    expect(harness.dependencies.getNativeIpc()).toBeNull()
    expect(harness.dependencies.getPrimaryWindow()).toBe(primary)
    expect(harness.dependencies.getSessionKeyForWindow(primary)).toBe('test-session')
    expect(harness.dependencies.getWorkspaceServiceForWindow(primary)).toBe(
      harness.registeredService,
    )
    expect(harness.dependencies.getWindowPool()).toBe(harness.windowPool)
    harness.dependencies.installManagedMainWindowLifecycle(primary, noopLogger)
    expect(harness.dependencies.isPrimaryWindowBootstrapping(primary)).toBe(true)
    harness.dependencies.presentPrimaryWindow(primary)
    harness.dependencies.writeWorkspaceSession('target', state)

    expect(activateWorkspaceWindowState).toHaveBeenCalledWith(primary, harness.root, noopLogger)
    expect(copyRendererPersistSession).toHaveBeenCalledWith(
      'marklab.workspace',
      'source',
      'target',
      overrides,
    )
    expect(harness.sessionKeyForWindow).toHaveBeenCalledWith(primary)
    expect(harness.registerWindow).toHaveBeenCalledWith(primary)
    expect(harness.installManagedMainWindowLifecycle).toHaveBeenCalledWith(primary, noopLogger)
    expect(harness.isPrimaryWindowBootstrapping).toHaveBeenCalledWith(primary)
    expect(harness.presentPrimaryWindow).toHaveBeenCalledWith(primary)
    expect(writeRendererPersistSession).toHaveBeenCalledWith('marklab.workspace', 'target', state)
  })

  it('opens an explicit path in a new window through the shared command handler', async () => {
    commandHandlers.open_path_in_new_window.mockResolvedValueOnce({ ok: true })
    const { setup } = createHarness(createWindow())

    await expect(setup.openPathInNewWindow('C:/notes/new.md')).resolves.toEqual({ ok: true })
    expect(commandHandlers.open_path_in_new_window).toHaveBeenCalledWith(
      { path: 'C:/notes/new.md' },
      null,
    )
  })

  it('uses the focused window when present', () => {
    const focused = createWindow()
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(focused)
    const { dependencies, root, rootInfoForWindow } = createHarness(createWindow())
    expect(dependencies.getCurrentWorkspaceRoot()).toEqual(root)
    expect(rootInfoForWindow).toHaveBeenCalledWith(focused)
  })

  it('uses the invoking renderer window even if focus changes during the command', () => {
    const invoking = createWindow()
    const newlyFocused = createWindow()
    vi.mocked(BrowserWindow.getFocusedWindow).mockReturnValue(newlyFocused)
    const { dependencies, rootInfoForWindow } = createHarness(createWindow())

    dependencies.getCurrentWorkspaceRoot(invoking)

    expect(rootInfoForWindow).toHaveBeenCalledWith(invoking)
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
