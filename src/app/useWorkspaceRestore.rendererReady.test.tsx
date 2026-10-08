import { StrictMode, type PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'
import type { WorkspaceSessionSeedPayload } from '@/runtime/rendererLifecycle'

const lifecycle = vi.hoisted(() => ({
  consumeWorkspaceSessionSeed: vi.fn(),
  hasPendingWorkspaceSessionSeed: vi.fn(() => true),
  pendingSeed: null as WorkspaceSessionSeedPayload | null,
  seedListener: null as ((payload: WorkspaceSessionSeedPayload) => void) | null,
  signalRendererReady: vi.fn(async () => undefined),
  waitForWorkspaceInteractivePaint: vi.fn(async (): Promise<void> => undefined),
}))

vi.mock('@/runtime/rendererLifecycle', () => ({
  consumeWorkspaceSessionSeed: lifecycle.consumeWorkspaceSessionSeed,
  hasPendingWorkspaceSessionSeed: lifecycle.hasPendingWorkspaceSessionSeed,
  onWorkspaceSessionSeed: vi.fn((listener: (payload: WorkspaceSessionSeedPayload) => void) => {
    lifecycle.seedListener = listener
    if (lifecycle.pendingSeed) listener(lifecycle.pendingSeed)
    return () => undefined
  }),
  signalRendererReady: lifecycle.signalRendererReady,
  waitForWorkspaceInteractivePaint: lifecycle.waitForWorkspaceInteractivePaint,
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn() }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: vi.fn(() => vi.fn()) },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('workspace renderer readiness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lifecycle.seedListener = null
    lifecycle.pendingSeed = null
    lifecycle.consumeWorkspaceSessionSeed.mockImplementation((payload) => {
      if (lifecycle.pendingSeed === payload) lifecycle.pendingSeed = null
    })
    lifecycle.hasPendingWorkspaceSessionSeed.mockReturnValue(true)
    lifecycle.waitForWorkspaceInteractivePaint.mockResolvedValue(undefined)
  })

  it('keeps standby hydration pending until the seeded workspace load completes', async () => {
    let finishLoad!: () => void
    const loadWorkspace = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve
        }),
    )
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )
    const seed = { state: { rootKind: 'external', rootPath: '/workspace' }, version: 1 }

    act(() => lifecycle.seedListener?.(seed))
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledOnce())
    expect(lifecycle.signalRendererReady).not.toHaveBeenCalled()
    expect(result.current.isSessionRestored).toBe(false)

    finishLoad()
    await waitFor(() =>
      expect(lifecycle.signalRendererReady).toHaveBeenCalledWith({
        phase: 'workspace-interactive',
      }),
    )
    expect(lifecycle.consumeWorkspaceSessionSeed).toHaveBeenCalledWith(seed)
    expect(result.current.isSessionRestored).toBe(true)
  })

  it('reports seeded workspace hydration errors without becoming interactive', async () => {
    const loadWorkspace = vi.fn(async () => {
      throw new Error('tree unavailable')
    })
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )

    act(() => lifecycle.seedListener?.({ state: { rootPath: '/workspace' }, version: 1 }))

    await waitFor(() =>
      expect(lifecycle.signalRendererReady).toHaveBeenCalledWith({
        error: 'tree unavailable',
        phase: 'workspace-error',
      }),
    )
    expect(result.current.restoreStatusMessage).toBe('app.restoreSessionFailed')
    expect(result.current.isSessionRestored).toBe(false)
  })

  it('retains a standby seed through the StrictMode effect replay', async () => {
    const loadWorkspace = vi.fn(async () => undefined)
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>
    const seed = { state: { rootPath: '/workspace' }, version: 1 }
    lifecycle.pendingSeed = seed
    renderHook(
      () =>
        useWorkspaceRestore({
          hasHydrated: true,
          loadWorkspace,
          rootKind: 'external',
          rootPath: '/workspace',
        }),
      { wrapper },
    )
    await waitFor(() =>
      expect(lifecycle.signalRendererReady).toHaveBeenCalledWith({
        phase: 'workspace-interactive',
      }),
    )
    expect(lifecycle.consumeWorkspaceSessionSeed).toHaveBeenCalledWith(seed)
    expect(loadWorkspace).toHaveBeenCalledOnce()
    expect(lifecycle.signalRendererReady).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'workspace-error' }),
    )
  })

  it('waits for a committed workspace frame before signaling interactive', async () => {
    let finishPaint!: () => void
    lifecycle.waitForWorkspaceInteractivePaint.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishPaint = resolve
      }),
    )
    const loadWorkspace = vi.fn(async () => undefined)
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )

    act(() => lifecycle.seedListener?.({ state: { rootPath: '/workspace' }, version: 1 }))
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledOnce())
    expect(lifecycle.signalRendererReady).not.toHaveBeenCalled()

    finishPaint()
    await waitFor(() =>
      expect(lifecycle.signalRendererReady).toHaveBeenCalledWith({
        phase: 'workspace-interactive',
      }),
    )
  })

  it('only reports the latest workspace seed interactive when loads overlap', async () => {
    const finishLoads: Array<() => void> = []
    const loadWorkspace = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLoads.push(resolve)
        }),
    )
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )
    const first = { state: { rootPath: '/first' }, version: 1 }
    const second = { state: { rootPath: '/second' }, version: 2 }

    act(() => lifecycle.seedListener?.(first))
    act(() => lifecycle.seedListener?.(second))
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2))

    finishLoads[0]?.()
    await act(async () => undefined)
    expect(lifecycle.signalRendererReady).not.toHaveBeenCalled()
    expect(lifecycle.consumeWorkspaceSessionSeed).not.toHaveBeenCalled()

    finishLoads[1]?.()
    await waitFor(() =>
      expect(lifecycle.signalRendererReady).toHaveBeenCalledWith({
        phase: 'workspace-interactive',
      }),
    )
    expect(lifecycle.consumeWorkspaceSessionSeed).toHaveBeenCalledOnce()
    expect(lifecycle.consumeWorkspaceSessionSeed).toHaveBeenCalledWith(second)
  })

  it('marks the default workspace interactive when no session seed is pending', async () => {
    lifecycle.hasPendingWorkspaceSessionSeed.mockReturnValue(false)
    const loadWorkspace = vi.fn(async () => undefined)

    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'internal',
        rootPath: '',
      }),
    )

    await waitFor(() =>
      expect(lifecycle.signalRendererReady).toHaveBeenCalledWith({
        phase: 'workspace-interactive',
      }),
    )
    expect(result.current.isSessionRestored).toBe(true)
  })

  it('shares the default restore across the StrictMode effect replay', async () => {
    lifecycle.hasPendingWorkspaceSessionSeed.mockReturnValue(false)
    const loadWorkspace = vi.fn(async () => undefined)
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>

    renderHook(
      () =>
        useWorkspaceRestore({
          hasHydrated: true,
          loadWorkspace,
          rootKind: 'internal',
          rootPath: '',
        }),
      { wrapper },
    )

    await waitFor(() =>
      expect(lifecycle.signalRendererReady).toHaveBeenCalledWith({
        phase: 'workspace-interactive',
      }),
    )
    expect(loadWorkspace).toHaveBeenCalledOnce()
    expect(lifecycle.signalRendererReady).not.toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'workspace-error' }),
    )
  })

  it('reports default workspace hydration errors to release the readiness wait', async () => {
    lifecycle.hasPendingWorkspaceSessionSeed.mockReturnValue(false)
    const loadWorkspace = vi.fn(async () => {
      throw new Error('default workspace failed')
    })

    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'internal',
        rootPath: '',
      }),
    )

    await waitFor(() =>
      expect(lifecycle.signalRendererReady).toHaveBeenCalledWith({
        error: 'default workspace failed',
        phase: 'workspace-error',
      }),
    )
  })
})
