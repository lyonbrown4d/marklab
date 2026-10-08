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
const workspaceApi = vi.hoisted(() => ({
  setRoot: vi.fn<(path: string | null) => Promise<void>>(async () => undefined),
  setSingleFile: vi.fn<(path: string) => Promise<void>>(async () => undefined),
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
vi.mock('@/services/fsApi', () => ({ fsApi: workspaceApi }))
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
    workspaceApi.setRoot.mockResolvedValue(undefined)
    workspaceApi.setSingleFile.mockResolvedValue(undefined)
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

    expect(loadWorkspace).toHaveBeenCalledOnce()
    finishDefault()
    await waitFor(() => expect(loadWorkspace).toHaveBeenCalledTimes(2))
    await waitFor(() =>
      expect(lifecycle.signalReady).toHaveBeenCalledWith({ phase: 'workspace-interactive' }),
    )
    expect(result.current.isSessionRestored).toBe(true)

    await act(async () => undefined)

    expect(lifecycle.signalReady).toHaveBeenCalledTimes(1)
    expect(lifecycle.consumeSeed).toHaveBeenCalledOnce()
    expect(lifecycle.consumeSeed).toHaveBeenCalledWith(seed)
  })

  it('does not restore a persisted single-file root after a native-open seed supersedes it', async () => {
    let finishFlush!: () => void
    const { flushEditorChanges } = await import('@/app/editorCloseLifecycle')
    vi.mocked(flushEditorChanges).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFlush = resolve
      }),
    )
    const loadWorkspace = vi.fn(async () => undefined)
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'single',
        rootPath: '/persisted/old.md',
      }),
    )

    await waitFor(() => expect(flushEditorChanges).toHaveBeenCalledOnce())
    const nativeOpenSeed = {
      state: {
        activeTabId: null,
        rootKind: 'single',
        rootPath: '/native/new.md',
        tabs: [],
      },
      version: 5,
    }
    lifecycle.applySeed.mockReturnValue({
      rootKind: 'single',
      rootPath: '/native/new.md',
    })
    act(() => lifecycle.listener?.(nativeOpenSeed))
    finishFlush()

    await waitFor(() => expect(lifecycle.consumeSeed).toHaveBeenCalledWith(nativeOpenSeed))
    expect(workspaceApi.setSingleFile).toHaveBeenCalledExactlyOnceWith('/native/new.md')
  })

  it('realigns the backend after an in-flight persisted root restore settles late', async () => {
    let finishPersistedRoot!: () => void
    workspaceApi.setSingleFile.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishPersistedRoot = resolve
      }),
    )
    const loadWorkspace = vi.fn(async () => undefined)
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'single',
        rootPath: '/persisted/old.md',
      }),
    )

    await waitFor(() =>
      expect(workspaceApi.setSingleFile).toHaveBeenCalledWith('/persisted/old.md'),
    )
    const nativeOpenSeed = {
      state: {
        activeTabId: null,
        rootKind: 'single',
        rootPath: '/native/new.md',
        tabs: [],
      },
      version: 6,
    }
    lifecycle.applySeed.mockReturnValue({
      rootKind: 'single',
      rootPath: '/native/new.md',
    })
    act(() => lifecycle.listener?.(nativeOpenSeed))
    finishPersistedRoot()

    await waitFor(() => expect(lifecycle.consumeSeed).toHaveBeenCalledWith(nativeOpenSeed))
    expect(workspaceApi.setSingleFile.mock.calls).toEqual([
      ['/persisted/old.md'],
      ['/native/new.md'],
    ])
  })

  it('keeps the latest root when a second native-open seed arrives during seed alignment', async () => {
    let finishFlush!: () => void
    let finishFirstAlignment!: () => void
    const { flushEditorChanges } = await import('@/app/editorCloseLifecycle')
    vi.mocked(flushEditorChanges).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFlush = resolve
      }),
    )
    workspaceApi.setSingleFile.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFirstAlignment = resolve
      }),
    )
    const loadWorkspace = vi.fn(async () => undefined)
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'single',
        rootPath: '/persisted/old.md',
      }),
    )
    await waitFor(() => expect(flushEditorChanges).toHaveBeenCalledOnce())

    const firstSeed = {
      state: { rootKind: 'single', rootPath: '/native/first.md', tabs: [] },
      version: 7,
    }
    lifecycle.applySeed.mockReturnValueOnce({
      rootKind: 'single',
      rootPath: '/native/first.md',
    })
    act(() => lifecycle.listener?.(firstSeed))
    finishFlush()
    await waitFor(() => expect(workspaceApi.setSingleFile).toHaveBeenCalledWith('/native/first.md'))

    const latestSeed = {
      state: { rootKind: 'single', rootPath: '/native/latest.md', tabs: [] },
      version: 8,
    }
    lifecycle.applySeed.mockReturnValueOnce({
      rootKind: 'single',
      rootPath: '/native/latest.md',
    })
    act(() => lifecycle.listener?.(latestSeed))
    expect(workspaceApi.setSingleFile).toHaveBeenCalledOnce()

    finishFirstAlignment()

    await waitFor(() => expect(lifecycle.consumeSeed).toHaveBeenCalledWith(latestSeed))
    expect(workspaceApi.setSingleFile.mock.calls).toEqual([
      ['/native/first.md'],
      ['/native/latest.md'],
    ])
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
