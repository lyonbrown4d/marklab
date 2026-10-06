import { describe, expect, it, vi } from 'vitest'

import { WebPreviewCapturePool } from '@electron/services/linkPreview/webPreviewCapturePool'

const createViewHarness = () => {
  const pendingCaptures: Array<() => void> = []
  const views: Array<{ options: unknown; webContents: ReturnType<typeof createWebContents> }> = []
  const createWebContents = () => {
    const image = {
      crop: vi.fn(() => image),
      getSize: vi.fn(() => ({ height: 1800, width: 2400 })),
      resize: vi.fn(() => image),
      toJPEG: vi.fn(() => Buffer.from([255, 216, 255])),
    }
    return {
      capturePage: vi.fn(
        () => new Promise<typeof image>((resolve) => pendingCaptures.push(() => resolve(image))),
      ),
      close: vi.fn(),
      isDestroyed: vi.fn(() => false),
      loadURL: vi.fn(async () => undefined),
      session: {
        clearStorageData: vi.fn(async () => undefined),
        on: vi.fn(),
        protocol: { handle: vi.fn(), unhandle: vi.fn() },
        setDevicePermissionHandler: vi.fn(),
        setDisplayMediaRequestHandler: vi.fn(),
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
        webRequest: { onBeforeRequest: vi.fn() },
      },
      setAudioMuted: vi.fn(),
      setBackgroundThrottling: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      stop: vi.fn(),
    }
  }
  class FakeView {
    readonly webContents = createWebContents()
    readonly setBounds = vi.fn()
    readonly setVisible = vi.fn()

    constructor(readonly options: unknown) {
      views.push(this)
    }
  }
  return { FakeView, pendingCaptures, views }
}

describe('WebPreviewCapturePool', () => {
  it('renders at most two pages concurrently and reuses the Chromium workers', async () => {
    const harness = createViewHarness()
    const owner = createOwner()
    const cache = { get: vi.fn(async () => null), set: vi.fn(async () => undefined) }
    const pool = new WebPreviewCapturePool({
      WebContentsView: harness.FakeView as never,
      cache,
      lookup: vi.fn(async () => ['93.184.216.34']),
      maxConcurrency: 2,
      settle: vi.fn(async () => undefined),
    })

    const first = pool.capture('https://example.com/one', owner as never)
    const second = pool.capture('https://example.com/two', owner as never)
    const third = pool.capture('https://example.com/three', owner as never)
    await vi.waitFor(() => expect(harness.views).toHaveLength(2))
    expect(harness.views.flatMap((view) => view.webContents.loadURL.mock.calls)).toHaveLength(2)

    harness.pendingCaptures.shift()?.()
    await first
    await vi.waitFor(() =>
      expect(harness.views.flatMap((view) => view.webContents.loadURL.mock.calls)).toHaveLength(4),
    )

    harness.pendingCaptures.shift()?.()
    await second
    harness.pendingCaptures.shift()?.()
    await third

    expect(harness.views).toHaveLength(2)
    expect(owner.contentView.addChildView).toHaveBeenCalledTimes(3)
    expect(owner.contentView.removeChildView).toHaveBeenCalledTimes(3)
    expect(cache.set).toHaveBeenCalledTimes(3)
    expect(harness.views[0]?.webContents.capturePage).toHaveBeenCalledWith(undefined, {
      stayHidden: true,
    })
    const image = await harness.views[0]?.webContents.capturePage.mock.results[0]?.value
    expect(image?.crop).toHaveBeenCalledWith({ height: 1350, width: 2400, x: 0, y: 225 })
    expect(image?.resize).toHaveBeenCalledWith({
      height: 1080,
      quality: 'best',
      width: 1920,
    })
    expect(harness.views[0]?.options).toMatchObject({
      webPreferences: expect.objectContaining({
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
        sandbox: true,
      }),
    })
    pool.dispose()
    expect(harness.views.every((view) => view.webContents.close.mock.calls.length === 1)).toBe(true)
  })

  it('serves disk-cached captures without creating a Chromium worker', async () => {
    const harness = createViewHarness()
    const pool = new WebPreviewCapturePool({
      WebContentsView: harness.FakeView as never,
      cache: {
        get: vi.fn(async () => new Uint8Array([1, 2, 3])),
        set: vi.fn(),
      },
      lookup: vi.fn(async () => ['93.184.216.34']),
    })

    await expect(
      pool.capture('https://example.com/cached', createOwner() as never),
    ).resolves.toMatchObject({
      bytes: new Uint8Array([1, 2, 3]),
      height: 1080,
      mediaType: 'image/jpeg',
      width: 1920,
    })
    expect(harness.views).toHaveLength(0)
  })

  it('returns a completed capture when the best-effort disk cache cannot be written', async () => {
    const harness = createViewHarness()
    const pool = new WebPreviewCapturePool({
      WebContentsView: harness.FakeView as never,
      cache: {
        get: vi.fn(async () => null),
        set: vi.fn(async () => Promise.reject(new Error('read only'))),
      },
      lookup: vi.fn(async () => ['93.184.216.34']),
      settle: vi.fn(async () => undefined),
    })

    const capture = pool.capture('https://example.com/cache-failure', createOwner() as never)
    await vi.waitFor(() => expect(harness.pendingCaptures).toHaveLength(1))
    harness.pendingCaptures.shift()?.()

    await expect(capture).resolves.toMatchObject({
      bytes: new Uint8Array([255, 216, 255]),
      mediaType: 'image/jpeg',
    })
    pool.dispose()
  })
})

const createOwner = () => ({
  contentView: {
    addChildView: vi.fn(),
    removeChildView: vi.fn(),
  },
  isDestroyed: vi.fn(() => false),
})
