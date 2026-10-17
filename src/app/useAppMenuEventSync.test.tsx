import { act, renderHook } from '@testing-library/react'
import { StrictMode, type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppMenuEventSync } from '@/app/useAppMenuEventSync'

const native = vi.hoisted(() => ({
  listeners: new Set<(event: { payload: string }) => void>(),
  warn: vi.fn(),
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({
  // Tauri registers synchronously, while the shared API returns its disposer
  // through a promise. StrictMode can clean up before that promise settles.
  listen: async (_event: string, receive: (event: { payload: string }) => void) => {
    native.listeners.add(receive)
    return () => native.listeners.delete(receive)
  },
}))
vi.mock('@/services/rendererDiagnostics', () => ({ rendererDiagnostics: { warn: native.warn } }))
const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>
const emit = () => native.listeners.forEach((receive) => receive({ payload: 'edit.paste' }))
beforeEach(() => {
  native.listeners.clear()
  native.warn.mockClear()
})

describe('native menu subscription lifetime', () => {
  it('dispatches a native menu action once after StrictMode remounts', async () => {
    const handle = vi.fn()
    renderHook(() => useAppMenuEventSync(handle), { wrapper })
    await act(async () => undefined)
    act(emit)
    expect(handle).toHaveBeenCalledExactlyOnceWith('edit.paste')
    expect(native.listeners.size).toBe(1)
  })

  it('ignores events after cleanup and releases disposers arriving after unmount', async () => {
    const handle = vi.fn()
    const { unmount } = renderHook(() => useAppMenuEventSync(handle), { wrapper })
    unmount()
    emit()
    expect(handle).not.toHaveBeenCalled()
    await act(async () => undefined)
    expect(native.listeners.size).toBe(0)
  })
})
