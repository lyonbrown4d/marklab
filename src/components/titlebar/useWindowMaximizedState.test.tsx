import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWindowMaximizedState } from '@/components/titlebar/useWindowMaximizedState'

const native = vi.hoisted(() => ({ subscribe: vi.fn(), warn: vi.fn() }))
vi.mock('@/runtime/window', () => ({ onWindowMaximizedChanged: native.subscribe }))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: native.warn } }))
beforeEach(() => vi.clearAllMocks())

describe('window caption state lifecycle', () => {
  it('does not subscribe for native macOS controls or browser previews', () => {
    renderHook(() => useWindowMaximizedState(false, vi.fn()))
    expect(native.subscribe).not.toHaveBeenCalled()
  })

  it('ignores late state and unsubscribes if installation resolves after unmount', async () => {
    let receive: (value: boolean) => void = () => undefined
    let installed: (stop: () => void) => void = () => undefined
    native.subscribe.mockImplementationOnce((handler) => {
      receive = handler
      return new Promise<() => void>((resolve) => {
        installed = resolve
      })
    })
    const update = vi.fn()
    const { unmount } = renderHook(() => useWindowMaximizedState(true, update))
    unmount()
    receive(true)
    const stop = vi.fn()
    await act(async () => {
      installed(stop)
    })
    expect(update).not.toHaveBeenCalled()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('releases an active subscription and contains installation failure', async () => {
    const stop = vi.fn()
    native.subscribe.mockResolvedValueOnce(stop)
    const update = vi.fn()
    const { unmount } = renderHook(() => useWindowMaximizedState(true, update))
    await act(async () => undefined)
    unmount()
    expect(stop).toHaveBeenCalledOnce()
    const failure = new Error('Resize permission unavailable')
    native.subscribe.mockRejectedValueOnce(failure)
    renderHook(() => useWindowMaximizedState(true, update))
    await act(async () => undefined)
    expect(native.warn).toHaveBeenCalledWith(
      'window.state',
      'maximized-subscription-failed',
      failure,
    )
  })
})
