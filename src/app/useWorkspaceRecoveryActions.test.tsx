import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceRecoveryActions } from '@/app/useWorkspaceRecoveryActions'
import type { WorkspaceRestoreFailure } from '@/app/workspaceRestoreTypes'

const openDialog = vi.hoisted(() => vi.fn())
vi.mock('@/runtime/dialog', () => ({ openDialog }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const failure: WorkspaceRestoreFailure = {
  phase: 'root',
  rootPath: '/missing',
  rootKind: 'external',
  detail: 'directory missing',
  message: 'Failed to restore workspace',
}
const createArgs = () => ({
  failure,
  retry: vi.fn(async () => true),
  openFolder: vi.fn(async () => true),
  useInternalRoot: vi.fn(async () => true),
  completeRecovery: vi.fn(async () => undefined),
})

describe('workspace recovery actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openDialog.mockResolvedValue('/relocated')
  })

  it('relocates in the current window while preserving relative tabs', async () => {
    const args = createArgs()
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('relocate')
    })
    expect(openDialog).toHaveBeenCalledWith(expect.objectContaining({ directory: true }))
    expect(args.openFolder).toHaveBeenCalledWith('/relocated', { preserveTabs: true })
    expect(args.completeRecovery).toHaveBeenCalledOnce()
    expect(result.current.error).toBeNull()
  })

  it('locates a moved single-file workspace with a file chooser', async () => {
    const args = { ...createArgs(), failure: { ...failure, rootKind: 'single' as const } }
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('relocate')
    })
    expect(openDialog).toHaveBeenCalledWith(
      expect.objectContaining({ directory: false, filters: expect.any(Array) }),
    )
  })

  it('opens another workspace in the current window with a fresh session', async () => {
    const args = createArgs()
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('open')
    })
    expect(args.openFolder).toHaveBeenCalledWith('/relocated', { preserveTabs: false })
    expect(args.completeRecovery).toHaveBeenCalledOnce()
  })

  it('returns to the internal workspace only after a successful switch', async () => {
    const args = createArgs()
    args.useInternalRoot.mockResolvedValueOnce(false)
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('internal')
    })
    expect(args.completeRecovery).not.toHaveBeenCalled()
    expect(result.current.error).toBe('app.workspaceRecoveryActionFailed')
    await act(async () => {
      await result.current.recover('internal')
    })
    expect(args.completeRecovery).toHaveBeenCalledOnce()
    expect(result.current.error).toBeNull()
  })

  it('keeps the failed root when the native dialog is cancelled', async () => {
    openDialog.mockResolvedValueOnce(null)
    const args = createArgs()
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('relocate')
    })
    expect(args.openFolder).not.toHaveBeenCalled()
    expect(args.completeRecovery).not.toHaveBeenCalled()
    expect(result.current.busyAction).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('shows chooser failure and remains recoverable', async () => {
    openDialog.mockRejectedValueOnce(new Error('dialog unavailable'))
    const args = createArgs()
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('open')
    })
    expect(result.current.error).toBe('dialog unavailable')
    expect(args.openFolder).not.toHaveBeenCalled()
    expect(result.current.busyAction).toBeNull()
  })

  it('prevents duplicate switches while the native chooser is pending', async () => {
    let finish!: (path: string) => void
    openDialog.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finish = resolve
      }),
    )
    const args = createArgs()
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.recover('relocate')
    })
    expect(result.current.busyAction).toBe('relocate')
    await act(async () => {
      await result.current.recover('internal')
    })
    expect(args.useInternalRoot).not.toHaveBeenCalled()
    await act(async () => {
      finish('/relocated')
      await pending
    })
    await waitFor(() => expect(result.current.busyAction).toBeNull())
    expect(args.openFolder).toHaveBeenCalledOnce()
  })

  it('retries without completing a separate root switch', async () => {
    const args = createArgs()
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('retry')
    })
    expect(args.retry).toHaveBeenCalledOnce()
    expect(args.completeRecovery).not.toHaveBeenCalled()
  })

  it('does not switch a workspace after unmounting during the chooser', async () => {
    let finish!: (path: string) => void
    openDialog.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finish = resolve
      }),
    )
    const args = createArgs()
    const { result, unmount } = renderHook(() => useWorkspaceRecoveryActions(args))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.recover('open')
    })
    unmount()
    await act(async () => {
      finish('/relocated')
      await pending
    })
    expect(args.openFolder).not.toHaveBeenCalled()
    expect(args.completeRecovery).not.toHaveBeenCalled()
  })

  it('does not apply an old chooser after another workspace supersedes the failure', async () => {
    let finish!: (path: string) => void
    openDialog.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        finish = resolve
      }),
    )
    const args = createArgs()
    const { result, rerender } = renderHook(
      ({ failure: currentFailure }: { failure: WorkspaceRestoreFailure | null }) =>
        useWorkspaceRecoveryActions({ ...args, failure: currentFailure }),
      { initialProps: { failure: failure as WorkspaceRestoreFailure | null } },
    )
    let pending!: Promise<void>
    act(() => {
      pending = result.current.recover('relocate')
    })
    rerender({ failure: null })
    await act(async () => {
      finish('/relocated')
      await pending
    })
    expect(args.openFolder).not.toHaveBeenCalled()
    expect(args.completeRecovery).not.toHaveBeenCalled()
  })

  it('keeps recovery open when saving or opening the selected root fails', async () => {
    const args = createArgs()
    args.openFolder.mockRejectedValueOnce(new Error('save failed'))
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('relocate')
    })
    expect(result.current.error).toBe('save failed')
    expect(args.completeRecovery).not.toHaveBeenCalled()
    expect(result.current.busyAction).toBeNull()
  })

  it('ignores recovery actions after the failure is resolved', async () => {
    const args = { ...createArgs(), failure: null }
    const { result } = renderHook(() => useWorkspaceRecoveryActions(args))
    await act(async () => {
      await result.current.recover('retry')
    })
    expect(args.retry).not.toHaveBeenCalled()
    expect(result.current.busyAction).toBeNull()
  })
})
