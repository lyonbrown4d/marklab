import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMainWindowSession, createStartupWindowSession } from '@electron/main/windowSession'
import { noopLogger } from '@electron/services/logger'
import { DEFAULT_SESSION_KEY } from '@electron/services/settingsStoreValues'
import { restoreLastWorkspaceSession } from '@electron/services/settingsStore'
import { createMarklabWindows } from '@electron/window'
import { activatePersistedWorkspaceWindowState } from '@electron/windowStateRestore'
import type { MarklabWindowPool } from '@electron/windowPool'

vi.mock('@electron/menu', () => ({ installNativeMenu: vi.fn() }))
vi.mock('@electron/window', () => ({ createMarklabWindows: vi.fn() }))
vi.mock('@electron/services/settingsStore', () => ({ restoreLastWorkspaceSession: vi.fn() }))
vi.mock('@electron/windowStateRestore', () => ({
  activatePersistedWorkspaceWindowState: vi.fn(),
}))

describe('createMainWindowSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(restoreLastWorkspaceSession).mockReturnValue([])
  })

  it('loads the splash before backend startup and main-window creation', async () => {
    const order: string[] = []
    const splash = {} as BrowserWindow
    const main = {} as BrowserWindow
    const windows = await createStartupWindowSession({
      createSplash: async () => {
        order.push('splash')
        return splash
      },
      startRuntime: async () => {
        order.push('runtime')
      },
      createSession: async (loadedSplash) => {
        order.push('main')
        return { main, splash: loadedSplash }
      },
    })

    expect(order).toEqual(['splash', 'runtime', 'main'])
    expect(windows).toEqual({ main, splash })
  })

  it.each([true, false])(
    'cleans up the startup splash on failure when destroyed=%s',
    async (destroyed) => {
      const destroy = vi.fn()
      const splash = { isDestroyed: () => destroyed, destroy } as unknown as BrowserWindow
      const createSession = vi.fn()
      await expect(
        createStartupWindowSession({
          createSplash: async () => splash,
          startRuntime: async () => {
            throw new Error('startup failed')
          },
          createSession,
        }),
      ).rejects.toThrow('startup failed')
      expect(createSession).not.toHaveBeenCalled()
      expect(destroy).toHaveBeenCalledTimes(destroyed ? 0 : 1)
    },
  )

  it('does not prewarm while the primary renderer is still hydrating', async () => {
    const main = {} as BrowserWindow
    const splash = {} as BrowserWindow
    vi.mocked(createMarklabWindows).mockResolvedValue({ main, splash })
    const pool: MarklabWindowPool = {
      acquireMainWindow: vi.fn(),
      activateMainWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
      destroyIdleWindows: vi.fn(),
      markRendererInteractive: vi.fn(),
      prewarmMainWindow: vi.fn(async () => undefined),
      restoreOpeningWindow: vi.fn(),
      stats: vi.fn(),
      waitForRendererInteractive: vi.fn(),
    }

    await createMainWindowSession({
      dispatchNativeMenuAction: vi.fn(),
      ensureWindowPool: () => pool,
      installManagedMainWindowLifecycle: vi.fn(),
      logger: noopLogger,
      loadedSplash: splash,
    })

    expect(pool.prewarmMainWindow).not.toHaveBeenCalled()
    expect(restoreLastWorkspaceSession).toHaveBeenCalledOnce()
    expect(vi.mocked(restoreLastWorkspaceSession).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createMarklabWindows).mock.invocationCallOrder[0]!,
    )
    expect(createMarklabWindows).toHaveBeenCalledWith(noopLogger, pool, splash)
  })

  it('registers the primary window with the stable persisted session key', async () => {
    const main = {} as BrowserWindow
    const splash = {} as BrowserWindow
    const installManagedMainWindowLifecycle = vi.fn()
    const onAdditionalWorkspaceSessions = vi.fn()
    const additionalSessions = [{ state: { rootKind: 'external', rootPath: '/other', tabs: [] } }]
    vi.mocked(restoreLastWorkspaceSession).mockReturnValueOnce(additionalSessions)
    vi.mocked(createMarklabWindows).mockResolvedValue({ main, splash })
    const pool = {
      prewarmMainWindow: vi.fn(async () => undefined),
    } as unknown as MarklabWindowPool

    await createMainWindowSession({
      dispatchNativeMenuAction: vi.fn(),
      ensureWindowPool: () => pool,
      installManagedMainWindowLifecycle,
      onAdditionalWorkspaceSessions,
      logger: noopLogger,
      loadedSplash: splash,
    })

    expect(installManagedMainWindowLifecycle).toHaveBeenCalledWith(
      main,
      noopLogger,
      DEFAULT_SESSION_KEY,
    )
    expect(onAdditionalWorkspaceSessions).toHaveBeenCalledWith(additionalSessions)
    expect(activatePersistedWorkspaceWindowState).toHaveBeenCalledWith(
      main,
      DEFAULT_SESSION_KEY,
      noopLogger,
    )
  })
})
