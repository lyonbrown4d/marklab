import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMainWindowSession } from '@electron/main/windowSession'
import { noopLogger } from '@electron/services/logger'
import { createMarklabWindows } from '@electron/window'
import type { MarklabWindowPool } from '@electron/windowPool'

vi.mock('@electron/menu', () => ({ installNativeMenu: vi.fn() }))
vi.mock('@electron/window', () => ({ createMarklabWindows: vi.fn() }))

describe('createMainWindowSession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts one lightweight prewarm after the primary renderer is ready', async () => {
    const main = {} as BrowserWindow
    const splash = {} as BrowserWindow
    vi.mocked(createMarklabWindows).mockResolvedValue({ main, splash })
    const pool: MarklabWindowPool = {
      acquireMainWindow: vi.fn(),
      activateMainWindow: vi.fn(),
      dispose: vi.fn(async () => undefined),
      destroyIdleWindows: vi.fn(),
      prewarmMainWindow: vi.fn(async () => undefined),
      restoreOpeningWindow: vi.fn(),
      stats: vi.fn(),
    }

    await createMainWindowSession({
      dispatchNativeMenuAction: vi.fn(),
      ensureWindowPool: () => pool,
      installManagedMainWindowLifecycle: vi.fn(),
      logger: noopLogger,
    })

    expect(pool.prewarmMainWindow).toHaveBeenCalledOnce()
  })
})
