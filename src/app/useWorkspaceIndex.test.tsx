import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceIndex } from '@/app/useWorkspaceIndex'
import { listen } from '@/runtime/events'
import { fsApi } from '@/services/fsApi'

let bufferStatusHandler: ((event: { payload: unknown }) => void) | undefined

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/runtime/events', () => ({
  listen: vi.fn(async (_event: string, handler: (event: { payload: unknown }) => void) => {
    bufferStatusHandler = handler
    return vi.fn()
  }),
}))

vi.mock('@/services/fsApi', async () => {
  const actual = await vi.importActual<typeof import('@/services/fsApi')>('@/services/fsApi')
  return {
    ...actual,
    fsApi: {
      ...actual.fsApi,
      getWorkspaceIndex: vi.fn(),
    },
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      key === 'workspaceIndex.refreshFailed' ? 'Failed to refresh workspace index' : key,
  }),
}))

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

const createWrapper = (queryClient: QueryClient) => {
  const QueryWrapper = ({ children }: PropsWithChildren) => {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }

  return QueryWrapper
}

describe('useWorkspaceIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bufferStatusHandler = undefined
    vi.mocked(fsApi.getWorkspaceIndex).mockResolvedValue({ files: [] })
  })

  it('shows localized feedback when refreshing the workspace index fails', async () => {
    const queryClient = createQueryClient()
    vi.spyOn(queryClient, 'invalidateQueries').mockRejectedValue(new Error('index locked'))

    renderHook(() => useWorkspaceIndex([{ path: 'D:/notes/today.md' }] as never, true), {
      wrapper: createWrapper(queryClient),
    })

    await waitFor(() => {
      expect(listen).toHaveBeenCalledWith('fs-buffer-status', expect.any(Function))
    })

    act(() => {
      bufferStatusHandler?.({
        payload: {
          path: 'D:/notes/today.md',
          revision: 2,
          dirty: false,
        },
      })
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to refresh workspace index', {
        description: 'Error: index locked',
      })
    })
  })
})
