import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SidebarExplorerPanel from '@/components/SidebarExplorerPanel'
import type { SidebarExplorerPanelProps } from '@/components/sidebarPanelTypes'

type MockSidebarFileTreeProps = {
  nodes: unknown[]
  readonlyTree: boolean
}

vi.mock('@/components/SidebarFileTree', () => ({
  default: ({ nodes, readonlyTree }: MockSidebarFileTreeProps) => (
    <div data-readonly={String(readonlyTree)} data-testid="file-tree">
      {nodes.length}
    </div>
  ),
}))

vi.mock('@/components/file-tree/FileOperationDialogs', () => ({
  FileNameDialog: () => null,
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'context.actionFailed': 'Action failed',
        'context.collapse': 'Collapse',
        'context.copied': 'Copied',
        'context.copyAbsolutePath': 'Copy absolute path',
        'context.copyMarkdownLink': 'Copy Markdown link',
        'context.copyPath': 'Copy path',
        'context.delete': 'Delete',
        'context.deleteConfirm': 'Delete {name}?',
        'context.deleteFolderConfirm': 'Delete folder {name}?',
        'context.expand': 'Expand',
        'context.newFile': 'New file',
        'context.newFilePrompt': 'New file name',
        'context.newFolder': 'New folder',
        'context.newFolderPrompt': 'New folder name',
        'context.open': 'Open',
        'context.openGraph': 'Open graph',
        'context.openInSystem': 'Open in system',
        'context.openSource': 'Open source',
        'context.properties': 'Properties',
        'context.rename': 'Rename',
        'context.renamePrompt': 'Rename to',
        'context.revealInFolder': 'Reveal in folder',
        'sidebar.files': 'Files',
        'sidebar.newFile': 'New file',
        'sidebar.newFolder': 'New folder',
        'sidebar.noProjectLoaded': 'No project loaded.',
        'sidebar.noSearchResults': 'No matching files.',
        'sidebar.recentProjects': 'Recent projects',
        'sidebar.search': 'Search files...',
        'sidebar.singleFileMode': 'Single-file mode',
        'sidebar.singleFileReadonlyHint':
          'The file tree only shows the opened file; create, rename, and delete are available in project workspaces.',
      }

      return labels[key] ?? key
    },
  }),
}))

const createProps = (
  overrides: Partial<SidebarExplorerPanelProps> = {},
): SidebarExplorerPanelProps => ({
  activePath: 'README.md',
  fileCount: 1,
  fileTree: [
    { name: 'README.md', path: 'README.md' },
  ] as unknown as SidebarExplorerPanelProps['fileTree'],
  focusFileFilterRequest: 0,
  onCreateFile: vi.fn(),
  onCreateFolder: vi.fn(),
  onDeletePath: vi.fn(),
  onInspectPath: vi.fn(),
  onMovePath: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenFileView: vi.fn(),
  onRenamePath: vi.fn(),
  rootKind: 'external',
  ...overrides,
})

describe('SidebarExplorerPanel', () => {
  it('explains the single-file readonly explorer instead of showing create actions', () => {
    render(<SidebarExplorerPanel {...createProps({ rootKind: 'single' })} />)

    expect(screen.getByText('Single-file mode')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The file tree only shows the opened file; create, rename, and delete are available in project workspaces.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New file' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New folder' })).not.toBeInTheDocument()
    expect(screen.getByTestId('file-tree')).toHaveAttribute('data-readonly', 'true')
  })

  it('uses a search-specific empty state when filtering hides all files', () => {
    render(<SidebarExplorerPanel {...createProps()} />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Search files...' }), {
      target: { value: 'missing' },
    })

    expect(screen.getByText('No matching files.')).toBeInTheDocument()
    expect(screen.queryByText('No project loaded.')).not.toBeInTheDocument()
  })
})
