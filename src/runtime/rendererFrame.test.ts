import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextRendererFrame } from '@/runtime/rendererFrame'

const native = vi.hoisted(() => ({
  tauri: true,
  visible: false,
  error: undefined as Error | undefined,
  warn: vi.fn(),
}))
vi.mock('@/runtime/environment', () => ({ isTauriRuntime: () => native.tauri }))
vi.mock('@/runtime/tauri/window', () => ({
  isTauriWindowVisible: async () => {
    if (native.error) throw native.error
    return native.visible
  },
}))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: native.warn } }))

let frame: FrameRequestCallback | undefined
beforeEach(() => {
  vi.useFakeTimers()
  native.tauri = true
  native.visible = false
  native.error = undefined
  native.warn.mockClear()
  frame = undefined
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frame = callback
    return 123
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('native renderer frame readiness', () => {
  it('yields a hidden Tauri renderer without a frame and cancels the suspended rAF', async () => {
    let resolved = false
    const pending = nextRendererFrame().then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(49)
    expect(resolved).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(123)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels the fallback when a hidden renderer produces a real frame first', async () => {
    const pending = nextRendererFrame()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(1)
    frame?.(0)
    await pending
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['visible Tauri', 'Electron'] as const)(
    'requires an actual frame for %s',
    async (runtime) => {
      native.visible = runtime === 'visible Tauri'
      native.tauri = runtime !== 'Electron'
      let resolved = false
      const pending = nextRendererFrame().then(() => {
        resolved = true
      })
      await vi.advanceTimersByTimeAsync(1000)
      expect(resolved).toBe(false)
      expect(vi.getTimerCount()).toBe(0)
      frame?.(0)
      await pending
    },
  )
  it('rechecks visibility when a presented renderer is hidden for another workspace attempt', async () => {
    native.visible = true
    const visible = nextRendererFrame()
    await vi.advanceTimersByTimeAsync(0)
    frame?.(0)
    await visible
    native.visible = false
    const hidden = nextRendererFrame()
    await vi.advanceTimersByTimeAsync(50)
    await hidden
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps the real-frame requirement if native visibility cannot be verified', async () => {
    native.error = new Error('Native visibility unavailable')
    let resolved = false
    const pending = nextRendererFrame().then(() => {
      resolved = true
    })
    await vi.advanceTimersByTimeAsync(1000)
    expect(resolved).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    expect(native.warn).toHaveBeenCalledWith(
      'app.lifecycle',
      'frame-visibility-unavailable',
      native.error,
    )
    frame?.(0)
    await pending
  })
})
