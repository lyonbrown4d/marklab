import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { NodeApi, TreeApi } from 'react-arborist'
import { useSidebarFileTreeState } from '@/components/file-tree/useSidebarFileTreeState'
import { useWorkspaceTreeNextPageLoader } from '@/components/file-tree/useWorkspaceTreeFolderLoader'
import type { ContextLabels, SidebarFileTreeProps } from '@/components/file-tree/types'
import type { FileTreeNode } from '@/logic/fileTree'
import { workspaceTreeApi } from '@/services/workspaceTreeApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'

vi.mock('@/components/file-tree/FileTreeNodeRenderer', () => ({ FileTreeNodeRenderer: () => null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { listChildren: vi.fn() },
}))

const createFixture = () => {
  const node = {
    data: { path: 'note.md', name: 'note.md', type: 'file' },
    isRoot: false,
    edit: vi.fn(),
  }
  const props: SidebarFileTreeProps = {
    activePath: 'note.md',
    nodes: [],
    searchTerm: '',
    readonlyTree: false,
    labels: {
      newFile: 'New file',
      newFolder: 'New folder',
      newFilePrompt: 'File name',
      newFolderPrompt: 'Folder name',
      deleteConfirm: 'Delete {name}?',
      deleteFolderConfirm: 'Delete folder {name}?',
    } as ContextLabels,
    onOpenFile: vi.fn(),
    onOpenFileView: vi.fn(),
    onInspectPath: vi.fn(),
    onCreateFile: vi.fn(),
    onCreateFolder: vi.fn(),
    onDeletePath: vi.fn(),
    onRenamePath: vi.fn(),
    onMovePath: vi.fn(),
  }
  const hook = renderHook(() => useSidebarFileTreeState(props))
  hook.result.current.treeRef.current = { focusedNode: node } as unknown as TreeApi<FileTreeNode>
  return { ...hook, node, props }
}

const keyboardEvent = (root: HTMLDivElement, target: HTMLElement, key: string) =>
  ({
    currentTarget: root,
    target,
    key,
    defaultPrevented: false,
    ctrlKey: key === 'n',
    metaKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  }) as unknown as KeyboardEvent<HTMLDivElement>

describe('file tree keyboard event boundaries', () => {
  it.each(['Enter', 'Delete', 'F2', 'n'])(
    'ignores %s from a menu portal outside the tree DOM',
    (key) => {
      const { result, node, props } = createFixture()
      const root = document.createElement('div')
      const menuItem = document.createElement('div')
      menuItem.setAttribute('role', 'menuitem')
      const event = keyboardEvent(root, menuItem, key)
      act(() => result.current.handleKeyDownCapture(event))
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(props.onOpenFile).not.toHaveBeenCalled()
      expect(node.edit).not.toHaveBeenCalled()
      expect(result.current.createRequest).toBeNull()
      expect(result.current.deleteRequest).toBeNull()
    },
  )

  it('still opens a focused file with Enter inside the tree', () => {
    const { result, props } = createFixture()
    const root = document.createElement('div')
    const row = document.createElement('button')
    root.append(row)
    const event = keyboardEvent(root, row, 'Enter')
    act(() => result.current.handleKeyDownCapture(event))
    expect(props.onOpenFile).toHaveBeenCalledExactlyOnceWith('note.md')
    expect(event.preventDefault).toHaveBeenCalled()
  })

  it('leaves inline rename keyboard handling to the input', () => {
    const { result, props } = createFixture()
    const root = document.createElement('div')
    const input = document.createElement('input')
    root.append(input)
    const event = keyboardEvent(root, input, 'Enter')
    act(() => result.current.handleKeyDownCapture(event))
    expect(props.onOpenFile).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})

describe('creating inside a collapsed folder', () => {
  it.each(['file', 'folder'] as const)('reveals the parent after creating a %s', async (kind) => {
    const { result, props, node } = createFixture()
    const open = vi.fn()
    result.current.treeRef.current = { focusedNode: node, open } as unknown as TreeApi<FileTreeNode>
    const folder = {
      isRoot: false,
      data: { path: 'docs', name: 'docs', type: 'folder' },
    } as NodeApi<FileTreeNode>
    act(() => result.current.requestCreateNode(folder, kind))
    await act(async () => {
      await result.current.handleCreateSubmit('New.md')
    })
    expect(kind === 'file' ? props.onCreateFile : props.onCreateFolder).toHaveBeenCalledWith(
      'docs/New.md',
    )
    expect(open).toHaveBeenCalledExactlyOnceWith('docs')
    expect(props.onOpenFile).not.toHaveBeenCalled()
  })

  it('does not expand or close the request when creation fails', async () => {
    const { result, props, node } = createFixture()
    const open = vi.fn()
    result.current.treeRef.current = { focusedNode: node, open } as unknown as TreeApi<FileTreeNode>
    const folder = {
      isRoot: false,
      data: { path: 'docs', name: 'docs', type: 'folder' },
    } as NodeApi<FileTreeNode>
    vi.mocked(props.onCreateFile).mockRejectedValueOnce(new Error('Already exists'))
    act(() => result.current.requestCreateNode(folder, 'file'))
    await act(async () => {
      await expect(result.current.handleCreateSubmit('New.md')).rejects.toThrow('Already exists')
    })
    expect(open).not.toHaveBeenCalled()
    expect(result.current.createRequest).toEqual({ kind: 'file', parentPath: 'docs' })
  })
})

describe('lazy folder projection', () => {
  it('loads bounded children the first time a folder toggles', async () => {
    useWorkspaceStore.setState({
      entries: [{ kind: 'folder', path: 'docs', hasChildren: true }],
      loadedTreeParents: [''],
      rootKind: 'external',
      rootPath: '/workspace',
      treeGeneration: 0,
      treeRevision: 2,
    })
    vi.mocked(workspaceTreeApi.listChildren).mockResolvedValue({
      entries: [{ kind: 'file', name: 'readme.md', path: 'docs/readme.md', hasChildren: false }],
      nextCursor: null,
      parent: 'docs',
      generation: 0,
      revision: 2,
      root: { kind: 'external', path: '/workspace' },
    })
    const { result } = createFixture()

    await act(async () => result.current.handleToggle('docs'))

    expect(workspaceTreeApi.listChildren).toHaveBeenCalledWith({
      cursor: null,
      limit: 256,
      parent: 'docs',
    })
    expect(useWorkspaceStore.getState().entries).toContainEqual({
      kind: 'file',
      path: 'docs/readme.md',
      hasChildren: false,
    })
  })

  it('keeps a failed folder load retryable and recovers on the next toggle', async () => {
    useWorkspaceStore.setState({
      entries: [{ kind: 'folder', path: 'docs', hasChildren: true }],
      loadedTreeParents: [''],
      rootKind: 'external',
      rootPath: '/workspace',
      treeGeneration: 0,
      treeRevision: 2,
    })
    vi.mocked(workspaceTreeApi.listChildren)
      .mockRejectedValueOnce(new Error('temporarily unavailable'))
      .mockResolvedValueOnce({
        entries: [{ kind: 'file', name: 'readme.md', path: 'docs/readme.md', hasChildren: false }],
        nextCursor: null,
        parent: 'docs',
        generation: 0,
        revision: 2,
        root: { kind: 'external', path: '/workspace' },
      })
    const { result } = createFixture()

    await act(async () => result.current.handleToggle('docs'))
    expect(useWorkspaceStore.getState()).toMatchObject({
      loadedTreeParents: [''],
      treeStatus: 'error',
    })
    await act(async () => result.current.handleToggle('docs'))

    expect(useWorkspaceStore.getState()).toMatchObject({
      loadedTreeParents: ['', 'docs'],
      treeError: null,
      treeStatus: 'ready',
    })
  })
})

describe('tree page fairness', () => {
  it('round-robins pending root and non-root cursors', async () => {
    useWorkspaceStore.setState({
      rootKind: 'external',
      rootPath: '/workspace',
      treeGeneration: 0,
      treeRevision: 2,
      treeNextCursors: { '': '0:2:256', docs: '0:2:256' },
    })
    vi.mocked(workspaceTreeApi.listChildren).mockImplementation(async ({ parent }) => ({
      entries: [],
      generation: 0,
      nextCursor: '0:2:512',
      parent: parent ?? '',
      revision: 2,
      root: { kind: 'external', path: '/workspace' },
    }))
    const { result } = renderHook(() => useWorkspaceTreeNextPageLoader('failed'))

    await act(async () => result.current())
    await act(async () => result.current())

    expect(workspaceTreeApi.listChildren).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ parent: '' }),
    )
    expect(workspaceTreeApi.listChildren).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ parent: 'docs' }),
    )
  })
})

describe('file operation dialog exit content', () => {
  it('keeps create content during exit and replaces it when another operation opens', async () => {
    const { result, props } = createFixture()
    act(() => result.current.requestCreateNode(null, 'file'))
    expect(result.current.createDialogOpen).toBe(true)
    expect(result.current.createDialogTitle).toBe('New file')
    act(() => result.current.closeCreateDialog(false))
    expect(result.current.createDialogOpen).toBe(false)
    expect(result.current.createDialogTitle).toBe('New file')
    expect(result.current.createDialogDescription).toBe('File name')
    expect(result.current.createDialogDefaultValue).toBe('Untitled.md')
    await act(async () => {
      await result.current.handleCreateSubmit('Stale.md')
    })
    expect(props.onCreateFile).not.toHaveBeenCalled()
    act(() => result.current.requestCreateNode(null, 'folder'))
    expect(result.current.createDialogOpen).toBe(true)
    expect(result.current.createDialogTitle).toBe('New folder')
    expect(result.current.createDialogDescription).toBe('Folder name')
    expect(result.current.createDialogDefaultValue).toBe('folder')
  })

  it('keeps the deleted target label during exit without allowing a stale confirmation', async () => {
    const { result, node, props } = createFixture()
    act(() => result.current.requestDeleteNode(node as unknown as NodeApi<FileTreeNode>))
    expect(result.current.deleteDialogOpen).toBe(true)
    expect(result.current.deleteDialogDescription).toBe('Delete note.md?')
    act(() => result.current.closeDeleteDialog(false))
    expect(result.current.deleteDialogOpen).toBe(false)
    expect(result.current.deleteDialogDescription).toBe('Delete note.md?')
    await act(async () => {
      await result.current.handleDeleteConfirm()
    })
    expect(props.onDeletePath).not.toHaveBeenCalled()
    const folder = {
      isRoot: false,
      data: { path: 'docs', name: 'docs', type: 'folder' },
    } as NodeApi<FileTreeNode>
    act(() => result.current.requestDeleteNode(folder))
    expect(result.current.deleteDialogOpen).toBe(true)
    expect(result.current.deleteDialogDescription).toBe('Delete folder docs?')
  })
})
