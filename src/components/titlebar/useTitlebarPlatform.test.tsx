import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTitlebarPlatform } from '@/components/titlebar/useTitlebarPlatform'

const native = vi.hoisted(() => ({
  desktop: true,
  getPlatform: vi.fn(),
  getWindow: vi.fn(),
  warn: vi.fn(),
}))
vi.mock('@/runtime/environment', () => ({ inferPlatformFromUserAgent: () => 'macos' }))
vi.mock('@/runtime/window', () => ({
  isDesktopRuntime: () => native.desktop,
  getCurrentRuntimeWindow: native.getWindow,
}))
vi.mock('@/services/appApi', () => ({ appApi: { getPlatform: native.getPlatform } }))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: native.warn } }))
beforeEach(() => {
  vi.clearAllMocks()
  native.desktop = true
  native.getPlatform.mockReset().mockResolvedValue('windows')
})

describe('titlebar native platform', () => {
  it('uses the native platform for Windows controls and keeps a stable current-window getter', async () => {
    const handle = { close: vi.fn() }
    native.getWindow.mockResolvedValue(handle)
    const { result, rerender } = renderHook(() => useTitlebarPlatform())
    await waitFor(() => expect(result.current.platform).toBe('windows'))
    expect(result.current.isWindows).toBe(true)
    expect(result.current.isMacDesktop).toBe(false)
    const getter = result.current.getAppWindow
    rerender()
    expect(result.current.getAppWindow).toBe(getter)
    expect(await getter()).toBe(handle)
  })

  it('uses the preview platform without native access in a browser', () => {
    native.desktop = false
    const { result } = renderHook(() => useTitlebarPlatform())
    expect(result.current.platform).toBe('macos')
    expect(result.current.isMacDesktop).toBe(false)
    expect(native.getPlatform).not.toHaveBeenCalled()
  })

  it('keeps inferred controls and reports a native platform failure', async () => {
    const failure = new Error('Platform unavailable')
    native.getPlatform.mockRejectedValueOnce(failure)
    const { result } = renderHook(() => useTitlebarPlatform())
    await waitFor(() =>
      expect(native.warn).toHaveBeenCalledWith(
        'window.platform',
        'native-platform-unavailable',
        failure,
      ),
    )
    expect(result.current.platform).toBe('macos')
  })

  it('ignores a late native response once the titlebar is unmounted', async () => {
    let finish: (platform: string) => void = () => undefined
    native.getPlatform.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    const { result, unmount } = renderHook(() => useTitlebarPlatform())
    unmount()
    await act(async () => {
      finish('windows')
    })
    expect(result.current.platform).toBe('macos')
    expect(native.warn).not.toHaveBeenCalled()
  })
})
