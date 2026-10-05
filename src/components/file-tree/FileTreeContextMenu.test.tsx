import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import type { NodeApi } from 'react-arborist'
import { describe, expect, it, vi } from 'vitest'
import { FileTreeContextMenu } from '@/components/file-tree/FileTreeContextMenu'
import { InlineRenameField } from '@/components/file-tree/InlineRenameField'
import type { ContextLabels } from '@/components/file-tree/types'
import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu'
import type { FileTreeNode } from '@/logic/fileTree'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

const labels: ContextLabels = {
  actionFailed: 'Action failed',
  collapse: 'Collapse',
  copied: 'Copied',
  copyAbsolutePath: 'Copy absolute path',
  copyMarkdownLink: 'Copy Markdown link',
  copyPath: 'Copy path',
  delete: 'Delete',
  deleteConfirm: 'Delete file?',
  deleteFolderConfirm: 'Delete folder?',
  expand: 'Expand',
  newFile: 'New file',
  newFilePrompt: 'New file name',
  newFolder: 'New folder',
  newFolderPrompt: 'New folder name',
  open: 'Open',
  openGraph: 'Open graph',
  openInSystem: 'Open in system',
  openSource: 'Open source',
  properties: 'Properties',
  rename: 'Rename',
  renamePrompt: 'Rename',
  revealInFolder: 'Reveal in folder',
}

const Harness = ({
  path = 'README.md',
  onEdit = vi.fn(),
  onSubmit = vi.fn(),
  onRowActivate = vi.fn(),
  onInspect = vi.fn(),
  onOpenFileView = vi.fn(),
}: {
  path?: string
  onEdit?: () => void
  onSubmit?: (name: string) => void
  onRowActivate?: () => void
  onInspect?: (path: string) => void
  onOpenFileView?: (path: string, view: 'source' | 'graph') => void
}) => {
  const [editing, setEditing] = useState(false)
  const node = {
    data: { name: path.split('/').at(-1) ?? path, path, type: 'file' },
    edit: async () => {
      onEdit()
      setEditing(true)
    },
    reset: () => setEditing(false),
    submit: async (name: string) => {
      onSubmit(name)
      setEditing(false)
    },
    isOpen: false,
    isRoot: false,
    toggle: vi.fn(),
  } as unknown as NodeApi<FileTreeNode>
  return (
    <div onClick={onRowActivate}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button>{path}</button>
        </ContextMenuTrigger>
        <FileTreeContextMenu
          labels={labels}
          node={node}
          readonlyTree={false}
          onInspectPath={onInspect}
          onOpenFile={vi.fn()}
          onOpenFileView={onOpenFileView}
          onRequestCreate={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ContextMenu>
      {editing ? <InlineRenameField label="Rename README.md" node={node} /> : null}
    </div>
  )
}

describe('FileTreeContextMenu', () => {
  it.each(['build.gradle', 'Dockerfile'])(
    'offers the source editor for previewable source file %s',
    async (path) => {
      const user = userEvent.setup()
      const onOpenFileView = vi.fn()
      render(<Harness onOpenFileView={onOpenFileView} path={path} />)
      fireEvent.contextMenu(screen.getByRole('button', { name: path }))

      await user.click(screen.getByRole('menuitem', { name: 'Open source' }))

      expect(onOpenFileView).toHaveBeenCalledExactlyOnceWith(path, 'source')
    },
  )

  it('keeps binary files preview-only while preserving Markdown text views', () => {
    const { unmount } = render(<Harness path="docs/spec.pdf" />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'docs/spec.pdf' }))
    expect(screen.queryByRole('menuitem', { name: 'Open source' })).not.toBeInTheDocument()
    unmount()

    render(<Harness />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    expect(screen.getByRole('menuitem', { name: 'Open source' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Open graph' })).toBeInTheDocument()
  })

  it('uses the shared application menu surface and item geometry', () => {
    render(<Harness />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))

    expect(screen.getByRole('menu')).toHaveClass(
      'rounded-xl',
      'border-border/80',
      'bg-popover/98',
      'p-1.5',
      'shadow-xl',
    )
    const openItem = screen.getByRole('menuitem', { name: /^Open\s*Enter$/ })
    expect(openItem).toHaveClass('min-h-8', 'rounded-lg', 'px-2.5', 'text-[13px]')
    expect(openItem.className).not.toContain('before:')
  })

  it('renders shortcut hints with the shared Kbd component', () => {
    render(<Harness />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    const openItem = screen.getByText('Open').closest('[role="menuitem"]')
    expect(openItem?.querySelector('[data-slot="kbd"]')).toHaveTextContent('Enter')
  })

  it('starts rename after the menu closes and keeps the input focused until submission', async () => {
    const user = userEvent.setup()
    const closedBeforeEdit: boolean[] = []
    const onSubmit = vi.fn()
    const onRowActivate = vi.fn()
    render(
      <Harness
        onEdit={() => closedBeforeEdit.push(screen.queryByRole('menu') === null)}
        onSubmit={onSubmit}
        onRowActivate={onRowActivate}
      />,
    )
    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    await user.click(screen.getByRole('menuitem', { name: /^Rename\s*F2$/ }))
    const input = await screen.findByRole('textbox', { name: 'Rename README.md' })
    await waitFor(() => expect(input).toHaveFocus())
    expect(closedBeforeEdit).toEqual([true])
    expect(onRowActivate).not.toHaveBeenCalled()
    await user.clear(input)
    await user.type(input, 'renamed.md{Enter}')
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith('renamed.md')
  })

  it('does not start a rename when the menu is dismissed', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    render(<Harness onEdit={onEdit} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    expect(onEdit).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('runs a menu action without activating its ancestor file row', async () => {
    const user = userEvent.setup()
    const onRowActivate = vi.fn()
    const onInspect = vi.fn()
    render(<Harness onRowActivate={onRowActivate} onInspect={onInspect} />)
    fireEvent.contextMenu(screen.getByRole('button', { name: 'README.md' }))
    await user.click(screen.getByRole('menuitem', { name: 'Properties' }))
    expect(onInspect).toHaveBeenCalledExactlyOnceWith('README.md')
    expect(onRowActivate).not.toHaveBeenCalled()
  })
})
