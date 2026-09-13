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

    fireEvent.click(screen.getByRole('button', { name: 'Search files...' }))

    fireEvent.change(screen.getByRole('textbox', { name: 'Search files...' }), {
      target: { value: 'missing' },
    })

    const empty = screen.getByRole('status')
    expect(empty).toHaveTextContent('No matching files.')
    expect(empty.querySelector('[data-slot="empty-icon"]')).toBeInTheDocument()
    expect(screen.queryByText('No project loaded.')).not.toBeInTheDocument()
  })

  it('uses a shared empty state when no project file tree is loaded', () => {
    render(<SidebarExplorerPanel {...createProps({ fileCount: 0, fileTree: [] })} />)

    const empty = screen.getByRole('status')
    expect(empty).toHaveTextContent('No project loaded.')
    expect(empty).toHaveAttribute('data-slot', 'empty')
    expect(screen.queryByTestId('file-tree')).not.toBeInTheDocument()
  })

  it('keeps filtering out of the way until requested and restores focus on Escape', () => {
    render(<SidebarExplorerPanel {...createProps()} />)
    const trigger = screen.getByRole('button', { name: 'Search files...' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Recent projects')).not.toBeInTheDocument()
    fireEvent.click(trigger)
    const input = screen.getByRole('textbox', { name: 'Search files...' })
    expect(input).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-controls', input.id)
    fireEvent.change(input, { target: { value: 'missing' } })
    expect(screen.queryByTestId('file-tree')).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('file-tree')).toBeVisible()
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens and selects the filter for repeated keyboard focus requests', () => {
    const props = createProps()
    const { rerender } = render(<SidebarExplorerPanel {...props} />)
    rerender(<SidebarExplorerPanel {...props} focusFileFilterRequest={1} />)
    const input = screen.getByRole('textbox', { name: 'Search files...' }) as HTMLInputElement
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: 'README' } })
    screen.getByRole('button', { name: 'New file' }).focus()
    rerender(<SidebarExplorerPanel {...props} focusFileFilterRequest={2} />)
    expect(input).toHaveFocus()
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe(6)
  })
})
