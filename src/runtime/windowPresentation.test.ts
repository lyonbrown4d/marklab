import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentRuntimeWindow,
  onWindowPresented,
  onWindowMaximizedChanged,
  setVimKeyboardOwnership,
} from '@/runtime/window'

const runtime = vi.hoisted(() => ({ desktop: false, window: {} as Record<string, unknown> }))
vi.mock('@/runtime/desktop', () => ({
  isDesktopRuntime: () => runtime.desktop,
  getDesktopRuntime: () => ({ window: runtime.window }),
}))
afterEach(() => {
  runtime.desktop = false
  runtime.window = {}
})

describe('window presentation runtime boundary', () => {
  it('uses the named desktop subscription and its unsubscribe handle', () => {
    runtime.desktop = true
    const unsubscribe = vi.fn()
    const onPresented = vi.fn(() => unsubscribe)
    runtime.window = { onPresented }
    const handler = vi.fn()
    expect(onWindowPresented(handler)).toBe(unsubscribe)
    expect(onPresented).toHaveBeenCalledWith(handler)
    expect(handler).not.toHaveBeenCalled()
  })

  it('presents immediately in a browser preview', () => {
    const handler = vi.fn()
    onWindowPresented(handler)()
    expect(handler).toHaveBeenCalledOnce()
  })

  it('keeps browser window operations inert and returns no native handle', async () => {
    expect(await getCurrentRuntimeWindow()).toBeNull()
    await expect(setVimKeyboardOwnership(true)).resolves.toBeUndefined()
    const callback = vi.fn()
    const stop = await onWindowMaximizedChanged(callback)
    stop()
    expect(callback).not.toHaveBeenCalled()
  })

  it('returns the native handle and forwards Vim ownership to that window', async () => {
    runtime.desktop = true
    const setOwnership = vi.fn(async () => undefined)
    runtime.window = { setVimKeyboardOwnership: setOwnership }
    expect(await getCurrentRuntimeWindow()).toBe(runtime.window)
    await setVimKeyboardOwnership(true)
    expect(setOwnership).toHaveBeenCalledExactlyOnceWith(true)
  })

  it('returns the named maximized subscription and its cleanup handle', async () => {
    runtime.desktop = true
    const stop = vi.fn()
    const subscribe = vi.fn(async () => stop)
    runtime.window = { onMaximizedChanged: subscribe }
    const receive = vi.fn()
    expect(await onWindowMaximizedChanged(receive)).toBe(stop)
    expect(subscribe).toHaveBeenCalledExactlyOnceWith(receive)
  })
})
