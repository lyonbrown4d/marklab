import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDesktopRuntime, isDesktopRuntime, type DesktopRuntimeApi } from '@/runtime/desktop'
import { inferPlatformFromUserAgent, isTauriRuntime, runInDesktop } from '@/runtime/environment'

afterEach(() => vi.unstubAllGlobals())

describe('desktop runtime availability', () => {
  it('rejects native access in SSR without installing or inventing a runtime', () => {
    vi.stubGlobal('window', undefined)
    expect(isDesktopRuntime()).toBe(false)
    expect(isTauriRuntime()).toBe(false)
    expect(getDesktopRuntime).toThrow('Desktop runtime API is unavailable.')
  })

  it('keeps browser previews inert without a native boundary', async () => {
    vi.stubGlobal('window', {})
    const operation = vi.fn()
    expect(getDesktopRuntime).toThrow('Desktop runtime API is unavailable.')
    await expect(runInDesktop(operation)).resolves.toBeNull()
    expect(operation).not.toHaveBeenCalled()
  })

  it('returns the installed Tauri object and propagates native operation failure', async () => {
    const api = { appReady: vi.fn() } as unknown as DesktopRuntimeApi
    vi.stubGlobal('window', { marklabTauri: api })
    expect(getDesktopRuntime()).toBe(api)
    expect(isDesktopRuntime()).toBe(true)
    expect(isTauriRuntime()).toBe(true)
    await expect(runInDesktop(async () => 'native')).resolves.toBe('native')
    const error = new Error('Native operation failed')
    await expect(
      runInDesktop(async () => {
        throw error
      }),
    ).rejects.toBe(error)
  })

  it.each([
    ['Macintosh', 'macos'],
    ['Windows NT', 'windows'],
    ['X11 Linux', 'linux'],
    ['Browser preview', 'unknown'],
  ] as const)('infers the preview platform from %s without IPC', (userAgent, expected) => {
    vi.stubGlobal('navigator', { userAgent })
    expect(inferPlatformFromUserAgent()).toBe(expected)
  })

  it('handles an unavailable navigator', () => {
    vi.stubGlobal('navigator', undefined)
    expect(inferPlatformFromUserAgent()).toBe('unknown')
  })
})
