import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppLayoutActions } from '@/app/useAppLayoutActions'
import { fsApi } from '@/services/fsApi'

const messages: Record<string, string> = {
  'workspaceActions.singleFileCreateFileUnavailable':
    'New files are unavailable in single-file mode.',
  'workspaceActions.singleFileCreateFolderUnavailable':
    'New folders are unavailable in single-file mode.',
  'workspaceActions.searchIndexRebuilding': 'Rebuilding search index...',
  'workspaceActions.searchIndexRebuilt': 'Search index rebuilt',
}

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    loading: vi.fn(() => 'search-index-toast'),
    success: vi.fn(),
  },
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    rebuildSearchIndex: vi.fn(),
  },
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => messages[key] ?? key,
  }),
}))

const createState = (overrides: Record<string, unknown> = {}) => ({
  createFile: vi.fn(),
  createFolder: vi.fn(),
  files: [],
  onOpenFile: vi.fn(),
  onOpenFileView: vi.fn(),
  onOpenGitDiff: vi.fn(),
  rootKind: 'single',
  ...overrides,
})

const createQueryClient = () =>
  ({
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
  }) as never

describe('useAppLayoutActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fsApi.rebuildSearchIndex).mockResolvedValue(undefined)
  })

  it('shows a localized toast instead of creating files in single-file mode', () => {
    const state = createState()
    const { result } = renderHook(() =>
      useAppLayoutActions({
        queryClient: createQueryClient(),
        state: state as never,
      }),
    )

    act(() => {
      result.current.handleCreateFile()
    })

    expect(state.createFile).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('New files are unavailable in single-file mode.')
  })

  it('shows a localized toast instead of creating folders in single-file mode', () => {
    const state = createState()
    const { result } = renderHook(() =>
      useAppLayoutActions({
        queryClient: createQueryClient(),
        state: state as never,
      }),
    )

    act(() => {
      result.current.handleCreateFolder()
    })

    expect(state.createFolder).not.toHaveBeenCalled()
    expect(toast.info).toHaveBeenCalledWith('New folders are unavailable in single-file mode.')
  })

  it('uses localized feedback while rebuilding the workspace search index', async () => {
    const queryClient = createQueryClient()
    const { result } = renderHook(() =>
      useAppLayoutActions({
        queryClient,
        state: createState({ rootKind: 'external' }) as never,
      }),
    )

    act(() => {
      result.current.handleRebuildSearchIndex()
    })

    expect(toast.loading).toHaveBeenCalledWith('Rebuilding search index...', {
      id: 'search-index-rebuild',
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('Search index rebuilt', {
        id: 'search-index-rebuild',
      })
    })
    expect(fsApi.rebuildSearchIndex).toHaveBeenCalledTimes(1)
  })
})
