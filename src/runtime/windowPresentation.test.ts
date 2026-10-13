import { afterEach, describe, expect, it, vi } from 'vitest'
import { onWindowPresented } from '@/runtime/window'

const runtime = vi.hoisted(() => ({ desktop: false, window: {} as Record<string, unknown> }))
vi.mock('@/runtime/electron', () => ({
  isElectronRuntime: () => runtime.desktop,
  getElectronRuntime: () => ({ window: runtime.window }),
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

  it('keeps hot reload usable while an older preload awaits Electron restart', () => {
    runtime.desktop = true
    const handler = vi.fn()
    onWindowPresented(handler)()
    expect(handler).toHaveBeenCalledOnce()
  })
})
