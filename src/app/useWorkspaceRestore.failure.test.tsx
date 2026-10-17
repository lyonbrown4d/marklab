import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'

const mocks = vi.hoisted(() => ({
  flushEditorChanges: vi.fn(),
  setRoot: vi.fn(),
  reportReady: vi.fn<(signal: { phase: string }) => Promise<void>>(async () => undefined),
}))

vi.mock('@/app/editorCloseLifecycle', () => ({
  flushEditorChanges: mocks.flushEditorChanges,
}))
vi.mock('@/app/workspaceRestoreReady', () => ({ reportWorkspaceRendererReady: mocks.reportReady }))
vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
  isTauriRuntime: () => false,
}))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/fsApi', () => ({
  fsApi: { setRoot: mocks.setRoot, setSingleFile: vi.fn() },
}))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: vi.fn(() => vi.fn()) },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('workspace restore failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.flushEditorChanges.mockResolvedValue(undefined)
    mocks.setRoot.mockResolvedValue({ kind: 'external', path: '/workspace' })
  })

  it('does not load or mark restored after the editor flush fails', async () => {
    mocks.flushEditorChanges.mockRejectedValueOnce(new Error('save failed'))
    const loadWorkspace = vi.fn(async () => undefined)
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )

    await waitFor(() => expect(mocks.flushEditorChanges).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.isRestoringSession).toBe(false))
    expect(result.current.restoreStatusMessage).toBe('app.restoreRootFailed')
    expect(result.current.isSessionRestored).toBe(false)
    expect(mocks.setRoot).not.toHaveBeenCalled()
    expect(loadWorkspace).not.toHaveBeenCalled()
    expect(result.current.restoreFailure).toMatchObject({
      detail: 'save failed',
      phase: 'root',
      rootKind: 'external',
      rootPath: '/workspace',
    })
  })

  it('does not load or mark restored after setting the root fails', async () => {
    mocks.setRoot.mockRejectedValueOnce(new Error('root unavailable'))
    const loadWorkspace = vi.fn(async () => undefined)
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )

    await waitFor(() => expect(mocks.setRoot).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.isRestoringSession).toBe(false))
    expect(result.current.restoreStatusMessage).toBe('app.restoreRootFailed')
    expect(result.current.isSessionRestored).toBe(false)
    expect(loadWorkspace).not.toHaveBeenCalled()
    expect(result.current.restoreFailure?.detail).toBe('root unavailable')
  })

  it('keeps recovery visible during a retry and clears it only after success', async () => {
    mocks.setRoot.mockRejectedValueOnce(new Error('root unavailable'))
    const loadWorkspace = vi.fn(async () => undefined)
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )
    await waitFor(() => expect(result.current.restoreFailure).not.toBeNull())
    let finishRoot!: () => void
    mocks.setRoot.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRoot = resolve
      }),
    )
    let retry!: Promise<boolean>
    act(() => {
      retry = result.current.restoreWorkspaceSession()
    })
    expect(result.current.isRestoringSession).toBe(true)
    expect(result.current.restoreFailure?.rootPath).toBe('/workspace')
    expect(result.current.isSessionRestored).toBe(false)
    await act(async () => {
      finishRoot()
      expect(await retry).toBe(true)
    })
    await waitFor(() => expect(result.current.isSessionRestored).toBe(true))
    expect(result.current.restoreFailure).toBeNull()
    expect(result.current.restoreStatusMessage).toBeNull()
  })

  it('retains failure details after a failed retry', async () => {
    mocks.setRoot.mockRejectedValue(new Error('root unavailable'))
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace: vi.fn(async () => undefined),
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )
    await waitFor(() => expect(result.current.restoreFailure).not.toBeNull())
    await act(async () => {
      expect(await result.current.restoreWorkspaceSession()).toBe(false)
    })
    expect(result.current.restoreFailure?.detail).toBe('root unavailable')
    expect(result.current.isRestoringSession).toBe(false)
  })

  it('completes an explicit root switch without replaying the failed persisted root', async () => {
    mocks.setRoot.mockRejectedValueOnce(new Error('root unavailable'))
    const loadWorkspace = vi.fn(async () => undefined)
    const { result, rerender } = renderHook(
      ({ rootPath }) =>
        useWorkspaceRestore({
          hasHydrated: true,
          loadWorkspace,
          rootKind: 'external',
          rootPath,
        }),
      { initialProps: { rootPath: '/workspace' } },
    )
    await waitFor(() => expect(result.current.restoreFailure).not.toBeNull())
    rerender({ rootPath: '/relocated' })
    await act(async () => {
      await result.current.completeWorkspaceRecovery()
      await result.current.completeWorkspaceRecovery()
    })
    expect(result.current.restoreFailure).toBeNull()
    expect(result.current.isSessionRestored).toBe(true)
    expect(mocks.setRoot).toHaveBeenCalledExactlyOnceWith('/workspace')
    expect(loadWorkspace).not.toHaveBeenCalled()
    expect(
      mocks.reportReady.mock.calls.filter(([signal]) => signal.phase === 'workspace-interactive'),
    ).toHaveLength(1)
  })

  it('does not replay a failed root while another workspace is being opened', async () => {
    mocks.setRoot.mockRejectedValueOnce(new Error('root unavailable'))
    const rootSwitchingRef = { current: false }
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace: vi.fn(async () => undefined),
        rootKind: 'external',
        rootPath: '/workspace',
        rootSwitchingRef,
      }),
    )
    await waitFor(() => expect(result.current.restoreFailure).not.toBeNull())
    rootSwitchingRef.current = true
    await act(async () => {
      expect(await result.current.restoreWorkspaceSession()).toBe(false)
    })
    expect(mocks.setRoot).toHaveBeenCalledOnce()
    expect(result.current.isRestoringSession).toBe(false)
    rootSwitchingRef.current = false
    await act(async () => {
      expect(await result.current.restoreWorkspaceSession()).toBe(true)
    })
    await waitFor(() => expect(result.current.restoreFailure).toBeNull())
  })

  it('waits for pending root restoration before an explicit workspace switch', async () => {
    let finishRoot!: () => void
    mocks.setRoot.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishRoot = resolve
      }),
    )
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace: vi.fn(async () => undefined),
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )
    await waitFor(() => expect(mocks.setRoot).toHaveBeenCalledOnce())
    const switched = vi.fn()
    let pending!: Promise<void>
    act(() => {
      pending = result.current.waitForWorkspaceRestore().then(switched)
    })
    await act(async () => undefined)
    expect(switched).not.toHaveBeenCalled()
    await act(async () => {
      finishRoot()
      await pending
    })
    expect(switched).toHaveBeenCalledOnce()
  })
})
