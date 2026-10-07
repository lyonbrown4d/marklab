import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useRightSidebarData } from '@/components/useRightSidebarData'
import { workspaceAnalysisApi } from '@/services/workspaceAnalysisApi'

vi.mock('@/services/workspaceAnalysisApi', () => ({
  workspaceAnalysisApi: {
    getDocumentInsights: vi.fn(),
  },
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    getPathMetadata: vi.fn().mockResolvedValue(null),
  },
}))

vi.mock('@/hooks/useMarkdownTextAnalysis', () => ({
  useMarkdownTextAnalysis: (content: string, enabled: boolean) => ({
    error: null,
    isLoading: false,
    outline: [],
    stats: enabled
      ? {
          lines: content ? content.split('\n').length : 0,
          words: content.trim().split(/\s+/).length,
        }
      : { lines: 0, words: 0 },
  }),
}))

type DocumentInsightsApi = {
  getDocumentInsights: (request: { path: string; asset_limit?: number }) => Promise<unknown>
}

const getDocumentInsights = vi.mocked(
  (workspaceAnalysisApi as unknown as DocumentInsightsApi).getDocumentInsights,
)

const emptyInsights = (path: string, revision = 1) => ({
  ready: true as const,
  revision,
  path,
  found: true,
  headings: [],
  backlinks: [],
  diagnostics: [],
  asset_report: {
    current_assets: [],
    current_asset_count: 0,
    current_missing_count: 0,
    workspace_missing_assets: [],
    workspace_missing_count: 0,
    limit: 80,
  },
  knowledge: {
    incoming: [],
    outgoing: [],
    missing: [],
    incoming_count: 0,
    outgoing_count: 0,
    missing_count: 0,
    orphan: true,
  },
})

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const createArgs = (targetPath: string) => ({
  collapsed: false,
  workspaceKey: 'external:D:/wiki',
  activePath: targetPath,
  targetPath,
  editorValue: '# Live\nsecond line',
  files: [],
  fileContents: {},
  dirtyPaths: {},
})

describe('useRightSidebarData', () => {
  beforeEach(() => getDocumentInsights.mockReset())

  it('maps bounded document insights while keeping editor statistics local', async () => {
    getDocumentInsights.mockResolvedValue({
      ...emptyInsights('target.md'),
      headings: [
        { path: 'target.md', level: 2, text: 'Details', slug: 'details', line: 4, column: 1 },
      ],
      backlinks: [
        {
          source_path: 'source.md',
          text: 'Target',
          context: 'See target',
          line: 2,
          column: 5,
          target_anchor: 'details',
          target_heading_slug: 'details',
        },
      ],
      diagnostics: [
        {
          line: 3,
          start_column: 2,
          end_column: 12,
          message: 'Missing link',
          severity: 'error',
        },
      ],
    })

    const { result } = renderHook(() => useRightSidebarData(createArgs('target.md')), {
      wrapper: createWrapper(),
    })

    expect(result.current.insightsLoading).toBe(true)
    expect(result.current.documentStats).toEqual({ lines: 2, words: 4 })

    await waitFor(() => expect(result.current.insightsLoading).toBe(false))
    expect(getDocumentInsights).toHaveBeenCalledWith({ path: 'target.md', asset_limit: 80 })
    expect(result.current.outline).toEqual([
      expect.objectContaining({ text: 'Details', slug: 'details' }),
    ])
    expect(result.current.backlinks).toEqual([
      expect.objectContaining({ sourcePath: 'source.md', targetAnchor: 'details' }),
    ])
    expect(result.current.problems).toEqual([
      expect.objectContaining({ startColumn: 2, endColumn: 12, severity: 'error' }),
    ])
  })

  it('isolates workspace/path queries and ignores a late response for the previous path', async () => {
    let resolveFirst: (value: ReturnType<typeof emptyInsights>) => void = () => undefined
    const first = new Promise<ReturnType<typeof emptyInsights>>((resolve) => {
      resolveFirst = resolve
    })
    getDocumentInsights.mockReturnValueOnce(first).mockResolvedValueOnce({
      ...emptyInsights('second.md', 2),
      headings: [
        { path: 'second.md', level: 1, text: 'Second', slug: 'second', line: 1, column: 1 },
      ],
    })

    const { result, rerender } = renderHook(({ path }) => useRightSidebarData(createArgs(path)), {
      initialProps: { path: 'first.md' },
      wrapper: createWrapper(),
    })
    rerender({ path: 'second.md' })

    await waitFor(() => expect(result.current.outline[0]?.text).toBe('Second'))
    act(() => resolveFirst(emptyInsights('first.md')))
    await act(async () => Promise.resolve())

    expect(result.current.outline[0]?.text).toBe('Second')
    expect(getDocumentInsights).toHaveBeenNthCalledWith(1, { path: 'first.md', asset_limit: 80 })
    expect(getDocumentInsights).toHaveBeenNthCalledWith(2, { path: 'second.md', asset_limit: 80 })
  })

  it('exposes an actionable error state and recovers on retry', async () => {
    getDocumentInsights
      .mockRejectedValueOnce(new Error('Index unavailable'))
      .mockResolvedValueOnce(emptyInsights('target.md'))

    const { result } = renderHook(() => useRightSidebarData(createArgs('target.md')), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.insightsError).toBe('Index unavailable'))
    await act(async () => result.current.retryInsights())
    await waitFor(() => expect(result.current.insightsError).toBeNull())
    expect(getDocumentInsights).toHaveBeenCalledTimes(2)
  })
})
