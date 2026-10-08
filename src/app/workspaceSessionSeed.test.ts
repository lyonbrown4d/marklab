import { beforeEach, describe, expect, it } from 'vitest'

import { applyWorkspaceSessionSeed } from '@/app/workspaceSessionSeed'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

describe('workspace session seed', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      activeTabId: 'file:edit:old.md',
      entries: [{ kind: 'file', path: 'old.md' }],
      loadedTreeParents: [''],
      rootKind: 'single',
      rootPath: '/persisted/old.md',
      tabs: [{ kind: 'file', path: 'old.md', view: 'edit' }],
      treeError: null,
      treeNextCursors: { '': null },
      treeStatus: 'ready',
      unavailableTreePaths: [],
    })
  })

  it('invalidates the previous tree projection when a native-open seed changes the root', () => {
    applyWorkspaceSessionSeed({
      state: {
        activeTabId: null,
        rootKind: 'single',
        rootPath: '/native/new.md',
        tabs: [],
      },
      version: 1,
    })

    expect(useWorkspaceStore.getState()).toMatchObject({
      activeTabId: null,
      entries: [],
      loadedTreeParents: [],
      rootKind: 'single',
      rootPath: '/native/new.md',
      tabs: [],
      treeNextCursors: {},
      treeStatus: 'idle',
      unavailableTreePaths: [],
    })
  })
})
