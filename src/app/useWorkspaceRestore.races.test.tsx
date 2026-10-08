import { StrictMode, type PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'
import type { WorkspaceSessionSeedPayload } from '@/runtime/rendererLifecycle'

const lifecycle = vi.hoisted(() => ({
  applySeed: vi.fn(() => ({})),
  consumeSeed: vi.fn(),
  hasPendingSeed: vi.fn(() => false),
  listener: null as ((payload: WorkspaceSessionSeedPayload) => void) | null,
  signalReady: vi.fn(async () => undefined),
  waitForPaint: vi.fn(async () => undefined),
}))

vi.mock('@/runtime/rendererLifecycle', () => ({
  consumeWorkspaceSessionSeed: lifecycle.consumeSeed,
  hasPendingWorkspaceSessionSeed: lifecycle.hasPendingSeed,
  onWorkspaceSessionSeed: vi.fn((listener: (payload: WorkspaceSessionSeedPayload) => void) => {
    lifecycle.listener = listener
    return () => undefined
  }),
  signalRendererReady: lifecycle.signalReady,
  waitForWorkspaceInteractivePaint: lifecycle.waitForPaint,
}))
vi.mock('@/app/workspaceSessionSeed', () => ({
  applyWorkspaceSessionSeed: lifecycle.applySeed,
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn() }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: vi.fn(() => vi.fn()) },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const defaultArgs = {
  rootKind: 'internal' as const,
  rootPath: '',
}

describe('workspace restore operation races', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lifecycle.listener = null
    lifecycle.applySeed.mockReturnValue({})
    lifecycle.hasPendingSeed.mockReturnValue(false)
  })

  it('does not apply a workspace seed until persisted state hydration finishes', async () => {
    const seed = { state: { rootPath: '/seeded' }, version: 1 }
    const loadWorkspace = vi.fn(async () => undefined)
    const { rerender } = renderHook(
      ({ hasHydrated }) => useWorkspaceRestore({ ...defaultArgs, hasHydrated, loadWorkspace }),
      { initialProps: { hasHydrated: false } },
    )

    act(() => lifecycle.listener?.(seed))
    expect(lifecycle.applySeed).not.toHaveBeenCalled()
    expect(loadWorkspace).not.toHaveBeenCalled()

    rerender({ hasHydrated: true })

    await waitFor(() => expect(lifecycle.applySeed).toHaveBeenCalledWith(seed))
    expect(loadWorkspace).toHaveBeenCalledOnce()
  })

  it('lets a seed supersede an unfinished default restore', async () => {
    let finishDefault!: () => void
    const loadWorkspace = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishDefault = resolve
          }),
      )
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() =>
      useWorkspaceRestore({ ...defaultArgs, hasHydrated: true, loadWorkspace }),
    )

    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledOnce())
    const seed = { state: { rootPath: '/newer' }, version: 2 }
    act(() => lifecycle.listener?.(seed))

    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(lifecycle.signalReady).toHaveBeenCalledWith({ phase: 'workspace-interactive' }),
    )
    expect(result.current.isSessionRestored).toBe(true)

    finishDefault()
    await act(async () => undefined)

    expect(lifecycle.signalReady).toHaveBeenCalledTimes(1)
    expect(lifecycle.consumeSeed).toHaveBeenCalledOnce()
    expect(lifecycle.consumeSeed).toHaveBeenCalledWith(seed)
  })

  it('loads one queued seed once during StrictMode effect replay', async () => {
    const loadWorkspace = vi.fn(async () => undefined)
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>
    const { rerender } = renderHook(
      ({ hasHydrated }) => useWorkspaceRestore({ ...defaultArgs, hasHydrated, loadWorkspace }),
      { initialProps: { hasHydrated: false }, wrapper },
    )
    const seed = { state: { rootPath: '/strict' }, version: 3 }

    act(() => lifecycle.listener?.(seed))
    rerender({ hasHydrated: true })

    await waitFor(() =>
      expect(lifecycle.signalReady).toHaveBeenCalledWith({ phase: 'workspace-interactive' }),
    )
    expect(lifecycle.applySeed).toHaveBeenCalledOnce()
    expect(loadWorkspace).toHaveBeenCalledOnce()
    expect(lifecycle.signalReady).toHaveBeenCalledOnce()
  })

  it('does not replay a completed seed when the loader identity changes', async () => {
    const firstLoader = vi.fn(async () => undefined)
    const secondLoader = vi.fn(async () => undefined)
    const { rerender, result } = renderHook(
      ({ loadWorkspace }) =>
        useWorkspaceRestore({ ...defaultArgs, hasHydrated: true, loadWorkspace }),
      { initialProps: { loadWorkspace: firstLoader } },
    )
    await waitFor(() => expect(firstLoader).toHaveBeenCalledOnce())
    const seed = { state: { rootPath: '/seeded' }, version: 4 }

    act(() => lifecycle.listener?.(seed))
    await waitFor(() => expect(lifecycle.consumeSeed).toHaveBeenCalledWith(seed))
    await act(async () => {
      await result.current.restoreWorkspaceSession()
    })
    rerender({ loadWorkspace: secondLoader })
    await act(async () => undefined)

    expect(firstLoader).toHaveBeenCalledTimes(3)
    expect(secondLoader).not.toHaveBeenCalled()
    expect(lifecycle.applySeed).toHaveBeenCalledOnce()
  })
})
