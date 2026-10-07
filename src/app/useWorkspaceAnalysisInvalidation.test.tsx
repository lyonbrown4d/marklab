import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceAnalysisInvalidation } from '@/app/useWorkspaceAnalysisInvalidation'
import { listen } from '@/runtime/events'

const handlers = new Map<string, (event: { payload: unknown }) => void>()

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({
  listen: vi.fn(async (name: string, handler: (event: { payload: unknown }) => void) => {
    handlers.set(name, handler)
    return vi.fn()
  }),
}))

const createWrapper =
  (client: QueryClient) =>
  ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

describe('useWorkspaceAnalysisInvalidation', () => {
  beforeEach(() => {
    handlers.clear()
    vi.clearAllMocks()
  })

  it('invalidates all bounded workspace projections after a saved buffer', async () => {
    const client = new QueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
    renderHook(() => useWorkspaceAnalysisInvalidation('directory:C:/one'), {
      wrapper: createWrapper(client),
    })
    await waitFor(() => expect(listen).toHaveBeenCalledTimes(2))

    act(() => {
      handlers.get('fs-buffer-status')?.({
        payload: { path: 'notes/today.md', revision: 2, dirty: false },
      })
    })

    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['workspace-document-insights', 'directory:C:/one'],
    })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ['workspace-graph', 'directory:C:/one'],
    })
  })

  it('cancels a pending dirty-buffer refresh when unmounted', async () => {
    vi.useFakeTimers()
    try {
      const client = new QueryClient()
      const invalidate = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined)
      const { unmount } = renderHook(() => useWorkspaceAnalysisInvalidation('directory:C:/one'), {
        wrapper: createWrapper(client),
      })
      await act(async () => Promise.resolve())
      act(() => {
        handlers.get('fs-buffer-status')?.({
          payload: { path: 'notes/today.md', revision: 1, dirty: true },
        })
      })
      unmount()
      act(() => vi.advanceTimersByTime(950))
      expect(invalidate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
