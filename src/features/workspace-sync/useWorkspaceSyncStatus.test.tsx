import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { type PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceSyncStatus } from '@/features/workspace-sync/useWorkspaceSyncStatus'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'
import type { WorkspaceSyncProgressEvent, WorkspaceSyncResult } from '@/types/workspaceSync'

let progressHandler: ((event: WorkspaceSyncProgressEvent) => void) | undefined

vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    getChannels: vi.fn(),
    getGitSummary: vi.fn(),
    listWebDavProfiles: vi.fn(),
    onProgress: vi.fn((handler) => {
      progressHandler = handler
      return vi.fn()
    }),
    start: vi.fn(),
    cancel: vi.fn(),
  },
}))

const wrapper = ({ children }: PropsWithChildren) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
)

describe('useWorkspaceSyncStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    progressHandler = undefined
    vi.mocked(workspaceSyncApi.getChannels).mockResolvedValue({
      git: null,
      webdav: { provider: 'webdav', profileId: 'cloud', remoteRoot: '/', autoSync: false },
    })
    vi.mocked(workspaceSyncApi.getGitSummary).mockResolvedValue({ status: 'not_repository' })
    vi.mocked(workspaceSyncApi.listWebDavProfiles).mockResolvedValue([])
    vi.mocked(workspaceSyncApi.start).mockImplementation(() => new Promise(() => undefined))
  })

  it('restores each workspace sync and routes concurrent progress by request id', async () => {
    const { result, rerender } = renderHook(
      ({ rootPath }) => useWorkspaceSyncStatus({ rootKind: 'external', rootPath }),
      { initialProps: { rootPath: 'C:/one' }, wrapper },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.onStart())
    await waitFor(() => expect(workspaceSyncApi.start).toHaveBeenCalledOnce())
    const firstRequestId = vi.mocked(workspaceSyncApi.start).mock.calls[0]?.[0]
    expect(firstRequestId).toBeTruthy()

    act(() => {
      progressHandler?.({
        requestId: 'another-request',
        progress: { stage: 'applying', completed: 7, total: 10 },
      })
    })
    expect(result.current.webdav).toMatchObject({ status: 'syncing', progress: 0 })

    act(() => {
      progressHandler?.({
        requestId: firstRequestId!,
        progress: { stage: 'applying', completed: 7, total: 10 },
      })
    })
    expect(result.current.webdav).toMatchObject({ status: 'syncing', progress: 70 })

    rerender({ rootPath: 'D:/two' })
    await waitFor(() => expect(result.current.webdav.status).toBe('idle'))
    act(() => result.current.onStart())
    await waitFor(() => expect(workspaceSyncApi.start).toHaveBeenCalledTimes(2))
    const secondRequestId = vi.mocked(workspaceSyncApi.start).mock.calls[1]?.[0]

    act(() => {
      progressHandler?.({
        requestId: secondRequestId!,
        progress: { stage: 'planning', completed: 3, total: 5 },
      })
      progressHandler?.({
        requestId: firstRequestId!,
        progress: { stage: 'writing_manifest', completed: 9, total: 10 },
      })
    })
    expect(result.current.webdav).toMatchObject({ status: 'syncing', progress: 60 })

    rerender({ rootPath: 'c:\\one\\' })
    await waitFor(() =>
      expect(result.current.webdav).toMatchObject({ status: 'syncing', progress: 90 }),
    )
    act(() => result.current.onStart())
    expect(workspaceSyncApi.start).toHaveBeenCalledTimes(2)
  })

  it('keeps cancellation state and settlement isolated to its workspace', async () => {
    const starts: Array<{
      reject: (error: Error) => void
      requestId: string
    }> = []
    vi.mocked(workspaceSyncApi.start).mockImplementation(
      (requestId) =>
        new Promise((_resolve, reject) => {
          starts.push({ requestId, reject })
        }),
    )
    let resolveCancel: ((value: { ok: true; cancelled: boolean }) => void) | undefined
    vi.mocked(workspaceSyncApi.cancel).mockImplementation(
      () => new Promise((resolve) => (resolveCancel = resolve)),
    )
    const { result, rerender } = renderHook(
      ({ rootPath }) => useWorkspaceSyncStatus({ rootKind: 'external', rootPath }),
      { initialProps: { rootPath: 'C:/one' }, wrapper },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.onStart())
    await waitFor(() => expect(starts).toHaveLength(1))

    rerender({ rootPath: 'D:/two' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.onStart())
    await waitFor(() => expect(starts).toHaveLength(2))

    rerender({ rootPath: 'C:/one' })
    act(() => result.current.onCancel())
    await waitFor(() => expect(workspaceSyncApi.cancel).toHaveBeenCalledWith(starts[0]?.requestId))
    expect(result.current.cancelPending).toBe(true)

    rerender({ rootPath: 'D:/two' })
    expect(result.current.webdav.status).toBe('syncing')
    expect(result.current.cancelPending).toBe(false)

    await act(async () => resolveCancel?.({ ok: true, cancelled: true }))
    await act(async () => starts[0]?.reject(new DOMException('cancelled', 'AbortError')))
    expect(result.current.webdav.status).toBe('syncing')

    rerender({ rootPath: 'C:/one' })
    await waitFor(() => expect(result.current.webdav.status).toBe('idle'))
    expect(result.current.cancelPending).toBe(false)
  })

  it('keeps completed results and failures scoped to their workspace', async () => {
    const firstResult: WorkspaceSyncResult = {
      changedPaths: ['notes/one.md'],
      conflicts: [{ path: 'notes/one.md', status: 'unresolved', reason: 'both_changed' }],
      skipped: [],
      uploaded: 1,
      downloaded: 0,
      deleted: 0,
      retries: 0,
    }
    vi.mocked(workspaceSyncApi.start)
      .mockResolvedValueOnce(firstResult)
      .mockRejectedValueOnce(new Error('second workspace failed'))
    const { result, rerender } = renderHook(
      ({ rootPath }) => useWorkspaceSyncStatus({ rootKind: 'external', rootPath }),
      { initialProps: { rootPath: 'C:/one' }, wrapper },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.onStart())
    await waitFor(() =>
      expect(result.current.webdav).toMatchObject({ status: 'idle', conflictCount: 1 }),
    )

    rerender({ rootPath: 'D:/two' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.onStart())
    await waitFor(() =>
      expect(result.current.webdav).toMatchObject({
        status: 'error',
        message: 'second workspace failed',
      }),
    )

    rerender({ rootPath: 'C:/one' })
    await waitFor(() =>
      expect(result.current.webdav).toMatchObject({ status: 'idle', conflictCount: 1 }),
    )
  })

  it('returns to idle after user cancellation and suppresses the aborted start error', async () => {
    let rejectStart: ((error: Error) => void) | undefined
    vi.mocked(workspaceSyncApi.start).mockImplementation(
      () => new Promise((_resolve, reject) => (rejectStart = reject)),
    )
    let resolveCancel: ((value: { ok: true; cancelled: boolean }) => void) | undefined
    vi.mocked(workspaceSyncApi.cancel).mockImplementation(
      () => new Promise((resolve) => (resolveCancel = resolve)),
    )
    const { result } = renderHook(
      () => useWorkspaceSyncStatus({ rootKind: 'external', rootPath: 'C:/one' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.onStart())
    await waitFor(() => expect(result.current.webdav.status).toBe('syncing'))

    act(() => {
      result.current.onCancel()
      result.current.onCancel()
    })
    await waitFor(() => expect(workspaceSyncApi.cancel).toHaveBeenCalledTimes(1))
    expect(workspaceSyncApi.cancel).toHaveBeenCalledWith(
      vi.mocked(workspaceSyncApi.start).mock.calls[0]?.[0],
    )
    expect(result.current.cancelPending).toBe(true)

    await act(async () => resolveCancel?.({ ok: true, cancelled: true }))
    expect(result.current.webdav.status).toBe('syncing')
    expect(result.current.cancelPending).toBe(true)
    await act(async () => rejectStart?.(new DOMException('cancelled', 'AbortError')))
    await waitFor(() => expect(result.current.webdav.status).toBe('idle'))
    expect(result.current.cancelPending).toBe(false)
  })

  it('keeps an active sync visible when cancellation fails', async () => {
    vi.mocked(workspaceSyncApi.cancel).mockRejectedValueOnce(new Error('cancel failed'))
    const { result } = renderHook(
      () => useWorkspaceSyncStatus({ rootKind: 'external', rootPath: 'C:/one' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.onStart())
    await waitFor(() => expect(result.current.webdav.status).toBe('syncing'))

    act(() => result.current.onCancel())
    await waitFor(() => expect(result.current.cancelError).toBe('cancel failed'))

    expect(result.current.webdav.status).toBe('syncing')
    expect(result.current.cancelPending).toBe(false)
  })

  it('exposes Git summary query errors separately with a retry action', async () => {
    vi.mocked(workspaceSyncApi.getGitSummary).mockRejectedValueOnce(new Error('git unavailable'))
    const { result } = renderHook(
      () => useWorkspaceSyncStatus({ rootKind: 'external', rootPath: 'C:/one' }),
      { wrapper },
    )
    await waitFor(() => expect(result.current.git.status).toBe('error'))

    vi.mocked(workspaceSyncApi.getGitSummary).mockResolvedValueOnce({ status: 'not_repository' })
    await act(async () => result.current.onRetryGit())
    await waitFor(() => expect(result.current.git.status).toBe('not_repository'))
  })
})
