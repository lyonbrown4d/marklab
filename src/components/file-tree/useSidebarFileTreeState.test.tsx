import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { NodeApi, TreeApi } from 'react-arborist'
import { useSidebarFileTreeState } from '@/components/file-tree/useSidebarFileTreeState'
import type { ContextLabels, SidebarFileTreeProps } from '@/components/file-tree/types'
import type { FileTreeNode } from '@/logic/fileTree'

vi.mock('@/components/file-tree/FileTreeNodeRenderer', () => ({ FileTreeNodeRenderer: () => null }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

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
