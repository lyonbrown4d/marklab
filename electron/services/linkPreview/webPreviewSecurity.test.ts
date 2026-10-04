import { afterEach, describe, expect, it, vi } from 'vitest'

import { installWebPreviewSessionSecurity } from '@electron/services/linkPreview/webPreviewSecurity.js'

describe('web preview capture session security', () => {
  afterEach(() => vi.useRealTimers())

  it('denies capabilities and validates every remote request before Chromium loads it', async () => {
    let beforeRequest!: (
      details: { url: string },
      callback: (result: { cancel: boolean }) => void,
    ) => void
    const preventDefault = vi.fn()
    const session = {
      on: vi.fn((_event: string, listener: (event: { preventDefault: () => void }) => void) =>
        listener({ preventDefault }),
      ),
      setDevicePermissionHandler: vi.fn(),
      setDisplayMediaRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      webRequest: {
        onBeforeRequest: vi.fn((handler) => {
          beforeRequest = handler
        }),
      },
    }
    installWebPreviewSessionSecurity(
      session as never,
      vi.fn(async (hostname: string) =>
        hostname === 'example.com' ? ['93.184.216.34'] : ['127.0.0.1'],
      ),
    )

    expect(session.setPermissionCheckHandler.mock.calls[0]?.[0]()).toBe(false)
    expect(preventDefault).toHaveBeenCalledOnce()

    const publicResult = vi.fn()
    beforeRequest({ url: 'https://example.com/image.png' }, publicResult)
    await vi.waitFor(() => expect(publicResult).toHaveBeenCalledWith({ cancel: false }))

    const privateResult = vi.fn()
    beforeRequest({ url: 'https://127.0.0.1/private' }, privateResult)
    await vi.waitFor(() => expect(privateResult).toHaveBeenCalledWith({ cancel: true }))

    const unsafeSchemeResult = vi.fn()
    beforeRequest({ url: 'file:///etc/passwd' }, unsafeSchemeResult)
    await vi.waitFor(() => expect(unsafeSchemeResult).toHaveBeenCalledWith({ cancel: true }))
  })

  it('cancels a request when public-address validation does not finish in time', async () => {
    vi.useFakeTimers()
    let beforeRequest!: (
      details: { url: string },
      callback: (result: { cancel: boolean }) => void,
    ) => void
    const session = {
      on: vi.fn(),
      setDevicePermissionHandler: vi.fn(),
      setDisplayMediaRequestHandler: vi.fn(),
      setPermissionCheckHandler: vi.fn(),
      setPermissionRequestHandler: vi.fn(),
      webRequest: { onBeforeRequest: vi.fn((handler) => (beforeRequest = handler)) },
    }
    installWebPreviewSessionSecurity(session as never, () => new Promise(() => undefined), {
      timeoutMs: 50,
    })
    const result = vi.fn()

    beforeRequest({ url: 'https://slow.example/resource' }, result)
    await vi.advanceTimersByTimeAsync(50)

    expect(result).toHaveBeenCalledWith({ cancel: true })
  })
})
