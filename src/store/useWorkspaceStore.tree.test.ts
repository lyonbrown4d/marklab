import { beforeEach, describe, expect, it } from 'vitest'

import { useWorkspaceStore } from '@/store/useWorkspaceStore'

const root = { kind: 'external', path: '/workspace' } as const

beforeEach(() => {
  useWorkspaceStore.setState({
    entries: [],
    loadedTreeParents: [],
    treeError: null,
    treeRevision: 0,
    treeStatus: 'idle',
    unavailableTreePaths: [],
    tabs: [],
    activeTabId: null,
  })
})

describe('workspace tree projection store', () => {
  it('replaces the root projection and merges children without duplicates', () => {
    const store = useWorkspaceStore.getState()
    store.replaceTreeProjection([{ kind: 'folder', path: 'docs', hasChildren: true }], 0, 2, '')
    useWorkspaceStore
      .getState()
      .mergeTreeChildren(
        'docs',
        [{ kind: 'file', path: 'docs/readme.md', hasChildren: false }],
        0,
        2,
      )

    expect(useWorkspaceStore.getState()).toMatchObject({
      entries: [
        { kind: 'folder', path: 'docs', hasChildren: true },
        { kind: 'file', path: 'docs/readme.md', hasChildren: false },
      ],
      loadedTreeParents: ['', 'docs'],
      treeRevision: 2,
      treeStatus: 'ready',
    })
  })

  it('applies an ordered delta and reports a revision gap', () => {
    useWorkspaceStore.getState().replaceTreeProjection([], 0, 2, '')
    const applied = useWorkspaceStore.getState().applyTreeDelta({
      generation: 0,
      kind: 'changes',
      previousRevision: 2,
      revision: 3,
      root,
      changes: [{ type: 'added', entry: { kind: 'file', name: 'new.md', path: 'new.md' } }],
    })
    const gap = useWorkspaceStore.getState().applyTreeDelta({
      generation: 0,
      kind: 'changes',
      previousRevision: 4,
      revision: 5,
      root,
      changes: [],
    })

    expect(applied).toBe(false)
    expect(gap).toBe(true)
    expect(useWorkspaceStore.getState()).toMatchObject({
      entries: [{ kind: 'file', path: 'new.md' }],
      treeRevision: 3,
    })
  })

  it('closes clean removed tabs while retaining dirty content for recovery', () => {
    useWorkspaceStore.setState({
      activeTabId: 'file:edit:notes/clean.md',
      entries: [
        { kind: 'file', path: 'notes/clean.md' },
        { kind: 'file', path: 'notes/dirty.md' },
      ],
      tabs: [
        { kind: 'file', path: 'notes/clean.md', view: 'edit' },
        { kind: 'file', path: 'notes/dirty.md', view: 'edit' },
      ],
      treeRevision: 2,
    })

    useWorkspaceStore.getState().applyTreeDelta(
      {
        generation: 0,
        kind: 'changes',
        previousRevision: 2,
        revision: 3,
        root,
        changes: [
          { type: 'removed', path: 'notes/clean.md' },
          { type: 'removed', path: 'notes/dirty.md' },
        ],
      },
      { 'notes/dirty.md': true },
    )

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeTabId: 'file:edit:notes/dirty.md',
      tabs: [{ kind: 'file', path: 'notes/dirty.md', view: 'edit' }],
      unavailableTreePaths: ['notes/dirty.md'],
    })
  })

  it('remaps clean renamed tabs but retains a dirty source path for recovery', () => {
    useWorkspaceStore.setState({
      activeTabId: 'file:edit:clean.md',
      entries: [
        { kind: 'file', path: 'clean.md' },
        { kind: 'file', path: 'dirty.md' },
      ],
      tabs: [
        { kind: 'file', path: 'clean.md', view: 'edit' },
        { kind: 'file', path: 'dirty.md', view: 'edit' },
      ],
      treeRevision: 2,
    })

    useWorkspaceStore.getState().applyTreeDelta(
      {
        generation: 0,
        kind: 'changes',
        previousRevision: 2,
        revision: 3,
        root,
        changes: [
          {
            type: 'renamed',
            from: 'clean.md',
            entry: { kind: 'file', name: 'moved.md', path: 'moved.md' },
          },
          {
            type: 'renamed',
            from: 'dirty.md',
            entry: { kind: 'file', name: 'saved.md', path: 'saved.md' },
          },
        ],
      },
      { 'dirty.md': true },
    )

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeTabId: 'file:edit:moved.md',
      tabs: [
        { kind: 'file', path: 'moved.md', view: 'edit' },
        { kind: 'file', path: 'dirty.md', view: 'edit' },
      ],
      unavailableTreePaths: ['dirty.md'],
    })
  })

  it('exposes loading and recoverable error states', () => {
    useWorkspaceStore.getState().beginTreeLoad()
    expect(useWorkspaceStore.getState().treeStatus).toBe('loading')
    useWorkspaceStore.getState().failTreeLoad(new Error('scan failed'))
    expect(useWorkspaceStore.getState()).toMatchObject({
      treeError: 'scan failed',
      treeStatus: 'error',
    })
  })

  it('prunes a removed subtree when refreshing a parent', () => {
    useWorkspaceStore.setState({
      entries: [
        { kind: 'folder', path: 'docs', hasChildren: true, childrenLoaded: true },
        { kind: 'folder', path: 'docs/removed', hasChildren: true, childrenLoaded: true },
        { kind: 'file', path: 'docs/removed/deep.md' },
      ],
      loadedTreeParents: ['', 'docs', 'docs/removed'],
      treeNextCursors: { '': null, docs: null, 'docs/removed': null },
    })

    useWorkspaceStore.getState().mergeTreeChildren('docs', [], 0, 4)

    expect(useWorkspaceStore.getState()).toMatchObject({
      entries: [{ kind: 'folder', path: 'docs', hasChildren: false, childrenLoaded: true }],
      loadedTreeParents: ['', 'docs'],
      treeNextCursors: { '': null, docs: null },
    })
  })

  it('restores unavailable paths on add and clears them on workspace switch', () => {
    useWorkspaceStore.setState({ unavailableTreePaths: ['restored.md'], treeRevision: 2 })
    useWorkspaceStore.getState().applyTreeDelta({
      generation: 0,
      kind: 'changes',
      previousRevision: 2,
      revision: 3,
      root,
      changes: [
        { type: 'added', entry: { kind: 'file', name: 'restored.md', path: 'restored.md' } },
      ],
    })
    expect(useWorkspaceStore.getState().unavailableTreePaths).toEqual([])

    useWorkspaceStore.setState({ unavailableTreePaths: ['old.md'] })
    useWorkspaceStore.getState().setRootPath('/other')
    expect(useWorkspaceStore.getState().unavailableTreePaths).toEqual([])
  })

  it('treats lazy metadata changes as meaningful entry updates', () => {
    useWorkspaceStore.setState({
      entries: [{ kind: 'folder', path: 'docs', hasChildren: true, childrenLoaded: false }],
    })
    useWorkspaceStore
      .getState()
      .setEntries([{ kind: 'folder', path: 'docs', hasChildren: false, childrenLoaded: true }])
    expect(useWorkspaceStore.getState().entries[0]).toMatchObject({
      hasChildren: false,
      childrenLoaded: true,
    })
  })

  it('drops stale cursors and removed loaded parents after an ordered delta', () => {
    useWorkspaceStore.setState({
      entries: [
        { kind: 'folder', path: 'docs' },
        { kind: 'folder', path: 'docs/old' },
      ],
      loadedTreeParents: ['', 'docs', 'docs/old'],
      treeNextCursors: { '': null, docs: '0:2:256', 'docs/old': null },
      treeRevision: 2,
    })

    useWorkspaceStore.getState().applyTreeDelta({
      changes: [{ type: 'removed', path: 'docs/old' }],
      generation: 0,
      kind: 'changes',
      previousRevision: 2,
      revision: 3,
      root,
    })

    expect(useWorkspaceStore.getState()).toMatchObject({
      loadedTreeParents: [''],
      treeNextCursors: { '': null },
    })
  })
})
