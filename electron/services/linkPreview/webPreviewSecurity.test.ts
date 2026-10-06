import { describe, expect, it, vi } from 'vitest'

import { installWebPreviewSessionSecurity } from '@electron/services/linkPreview/webPreviewSecurity'

describe('web preview capture session security', () => {
  it('denies browser capabilities and downloads', () => {
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
      webRequest: { onBeforeRequest: vi.fn((handler) => (beforeRequest = handler)) },
    }
    installWebPreviewSessionSecurity(session as never)

    expect(session.setPermissionCheckHandler.mock.calls[0]?.[0]()).toBe(false)
    const permissionCallback = vi.fn()
    session.setPermissionRequestHandler.mock.calls[0]?.[0](null, 'camera', permissionCallback)
    expect(permissionCallback).toHaveBeenCalledWith(false)
    expect(preventDefault).toHaveBeenCalledOnce()

    const allowed = vi.fn()
    beforeRequest({ url: 'https://example.com/style.css' }, allowed)
    expect(allowed).toHaveBeenCalledWith({ cancel: false })
    const blocked = vi.fn()
    beforeRequest({ url: 'file:///private/file' }, blocked)
    expect(blocked).toHaveBeenCalledWith({ cancel: true })

    const blank = vi.fn()
    beforeRequest({ url: 'about:blank' }, blank)
    expect(blank).toHaveBeenCalledWith({ cancel: false })
    const unsafeAboutPage = vi.fn()
    beforeRequest({ url: 'about:crash' }, unsafeAboutPage)
    expect(unsafeAboutPage).toHaveBeenCalledWith({ cancel: true })
  })
})
