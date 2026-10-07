import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'
import { fsApi } from '@/services/fsApi'

let treeListener: ((event: WorkspaceTreeDeltaEvent) => void) | undefined
const lifecycle = vi.hoisted(() => ({ flushEditorChanges: vi.fn() }))

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/app/editorCloseLifecycle', () => lifecycle)
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: {
    onChanged: vi.fn((handler: (event: WorkspaceTreeDeltaEvent) => void) => {
      treeListener = handler
      return vi.fn()
    }),
  },
}))
vi.mock('@/services/fsApi', () => ({
  fsApi: { setRoot: vi.fn(), setSingleFile: vi.fn() },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const root = { kind: 'external', path: '/workspace' } as const

beforeEach(() => {
  treeListener = undefined
  vi.clearAllMocks()
  lifecycle.flushEditorChanges.mockResolvedValue(undefined)
  useWorkspaceStore.setState({
    entries: [],
    rootKind: 'external',
    rootPath: '/workspace',
    treeRevision: 2,
  })
})

describe('workspace tree event recovery', () => {
  it.each([
    ['external', 'setRoot'],
    ['single', 'setSingleFile'],
  ] as const)('awaits editor flush before restoring a %s workspace', async (rootKind, method) => {
    let finishFlush: (() => void) | undefined
    lifecycle.flushEditorChanges.mockReturnValue(
      new Promise<void>((resolve) => {
        finishFlush = resolve
      }),
    )
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace: vi.fn(async () => undefined),
        rootKind,
        rootPath: '/workspace',
      }),
    )

    await waitFor(() => expect(lifecycle.flushEditorChanges).toHaveBeenCalledOnce())
    expect(fsApi[method]).not.toHaveBeenCalled()
    finishFlush?.()
    await waitFor(() => expect(fsApi[method]).toHaveBeenCalled())
  })

  it('applies an ordered delta without refreshing the root', async () => {
    const loadWorkspace = vi.fn(async () => undefined)
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: false,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '',
      }),
    )

    act(() =>
      treeListener?.({
        changes: [{ type: 'added', entry: { kind: 'file', name: 'note.md', path: 'note.md' } }],
        generation: 0,
        kind: 'changes',
        previousRevision: 2,
        revision: 3,
        root,
      }),
    )

    expect(useWorkspaceStore.getState().entries).toContainEqual({
      kind: 'file',
      path: 'note.md',
    })
    expect(loadWorkspace).not.toHaveBeenCalled()
  })

  it.each([
    { generation: 0, kind: 'invalidated', previousRevision: 2, revision: 3, root },
    { generation: 0, kind: 'changes', previousRevision: 4, revision: 5, root, changes: [] },
  ] satisfies WorkspaceTreeDeltaEvent[])(
    'refreshes after invalidation or a revision gap',
    async (event) => {
      const loadWorkspace = vi.fn(async () => undefined)
      renderHook(() =>
        useWorkspaceRestore({
          hasHydrated: false,
          loadWorkspace,
          rootKind: 'external',
          rootPath: '',
        }),
      )

      await act(async () => treeListener?.(event))

      expect(loadWorkspace).toHaveBeenCalledWith({ preserveCurrentRoute: true })
    },
  )

  it('reports an active clean tab remap so the route follows the delta', () => {
    useWorkspaceStore.setState({
      activeTabId: 'file:edit:old.md',
      entries: [{ kind: 'file', path: 'old.md' }],
      tabs: [{ kind: 'file', path: 'old.md', view: 'edit' }],
    })
    const onTreeActiveTabChanged = vi.fn()
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: false,
        loadWorkspace: vi.fn(async () => undefined),
        onTreeActiveTabChanged,
        rootKind: 'external',
        rootPath: '',
      }),
    )

    act(() =>
      treeListener?.({
        changes: [
          {
            type: 'renamed',
            from: 'old.md',
            entry: { kind: 'file', name: 'new.md', path: 'new.md' },
          },
        ],
        generation: 0,
        kind: 'changes',
        previousRevision: 2,
        revision: 3,
        root,
      }),
    )

    expect(onTreeActiveTabChanged).toHaveBeenCalledWith({
      kind: 'file',
      path: 'new.md',
      view: 'edit',
    })
  })

  it('reports an empty active tab after the last clean tab is removed', () => {
    useWorkspaceStore.setState({
      activeTabId: 'file:edit:last.md',
      entries: [{ kind: 'file', path: 'last.md' }],
      tabs: [{ kind: 'file', path: 'last.md', view: 'edit' }],
    })
    const onTreeActiveTabChanged = vi.fn()
    renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: false,
        loadWorkspace: vi.fn(async () => undefined),
        onTreeActiveTabChanged,
        rootKind: 'external',
        rootPath: '',
      }),
    )
    act(() =>
      treeListener?.({
        changes: [{ type: 'removed', path: 'last.md' }],
        generation: 0,
        kind: 'changes',
        previousRevision: 2,
        revision: 3,
        root,
      }),
    )
    expect(onTreeActiveTabChanged).toHaveBeenCalledWith(null)
  })
})
