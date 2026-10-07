import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

import { preloadWorkspaceGraph } from '@/app/preloadWorkspaceGraph'
import { fsApi } from '@/services/fsApi'

vi.mock('@/services/fsApi', () => ({
  fsApi: { getWorkspaceGraph: vi.fn() },
}))

describe('preloadWorkspaceGraph', () => {
  it('warms the workspace-scoped graph query once while a request is in flight', async () => {
    let finish!: () => void
    vi.mocked(fsApi.getWorkspaceGraph).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = () => resolve({ mode: 'mindmap', nodes: [], edges: [] })
      }),
    )
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const first = preloadWorkspaceGraph(queryClient, 'external:D:/wiki')
    const second = preloadWorkspaceGraph(queryClient, 'external:D:/wiki')
    finish()
    await Promise.all([first, second])

    expect(fsApi.getWorkspaceGraph).toHaveBeenCalledOnce()
    expect(queryClient.getQueryData(['workspace-graph', 'external:D:/wiki'])).toEqual({
      mode: 'mindmap',
      nodes: [],
      edges: [],
    })
  })

  it('keeps speculative preload failures out of the interaction path', async () => {
    vi.mocked(fsApi.getWorkspaceGraph).mockRejectedValueOnce(new Error('workspace unavailable'))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    await expect(preloadWorkspaceGraph(queryClient, 'external:D:/missing')).resolves.toBeUndefined()
  })
})
