import { render, screen } from '@testing-library/react'
import type { NodeApi } from 'react-arborist'
import { describe, expect, it, vi } from 'vitest'
import { FileTreeContextMenu } from '@/components/file-tree/FileTreeContextMenu'
import type { ContextLabels } from '@/components/file-tree/types'
import { ContextMenu } from '@/components/ui/context-menu'
import type { FileTreeNode } from '@/logic/fileTree'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

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

const createFileNode = () =>
  ({
    data: {
      name: 'README.md',
      path: 'README.md',
      type: 'file',
    },
    edit: vi.fn(),
    isOpen: false,
    isRoot: false,
    toggle: vi.fn(),
  }) as unknown as NodeApi<FileTreeNode>

describe('FileTreeContextMenu', () => {
  it('renders shortcut hints with the shared Kbd component', () => {
    render(
      <ContextMenu open>
        <FileTreeContextMenu
          labels={labels}
          node={createFileNode()}
          readonlyTree={false}
          onInspectPath={vi.fn()}
          onOpenFile={vi.fn()}
          onOpenFileView={vi.fn()}
          onRequestCreate={vi.fn()}
          onRequestDelete={vi.fn()}
        />
      </ContextMenu>,
    )

    const openItem = screen.getByText('Open').closest('[role="menuitem"]')

    expect(openItem?.querySelector('[data-slot="kbd"]')).toHaveTextContent('Enter')
  })
})
