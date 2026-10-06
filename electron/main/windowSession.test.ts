import type { BrowserWindow } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMainWindowSession } from '@electron/main/windowSession'
import { createMarklabWindows } from '@electron/window'

vi.mock('@electron/menu', () => ({ installNativeMenu: vi.fn() }))
vi.mock('@electron/window', () => ({ createMarklabWindows: vi.fn() }))

describe('createMainWindowSession', () => {
  beforeEach(() => vi.clearAllMocks())

  it('starts one lightweight prewarm after the primary renderer is ready', async () => {
    const main = {} as BrowserWindow
    const splash = {} as BrowserWindow
    vi.mocked(createMarklabWindows).mockResolvedValue({ main, splash })
    const pool = {
      prewarmMainWindow: vi.fn(async () => undefined),
    }

    await createMainWindowSession({
      dispatchNativeMenuAction: vi.fn(),
      ensureWindowPool: () => pool as never,
      installManagedMainWindowLifecycle: vi.fn(),
      logger: { child: vi.fn() } as never,
    })

    expect(pool.prewarmMainWindow).toHaveBeenCalledOnce()
  })
})
