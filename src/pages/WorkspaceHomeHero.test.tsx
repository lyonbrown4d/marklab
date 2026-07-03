import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WorkspaceHomeHero from '@/pages/WorkspaceHomeHero'

const translations = vi.hoisted(() => ({
  'actions.openFile': 'Open file',
  'actions.openProject': 'Open project',
  'workspaceHome.allPages': 'All pages',
  'workspaceHome.description': 'Search, graph, and browse every markdown file in this workspace.',
  'workspaceHome.eyebrow': 'Workspace',
  'workspaceHome.indexReady': 'Index ready',
  'workspaceHome.indexing': 'Indexing',
  'workspaceHome.openSingleDocument': 'Open document',
  'workspaceHome.searchWorkspace': 'Search workspace',
  'workspaceHome.showInSidebar': 'Show in sidebar',
  'workspaceHome.singleDescription': 'Use focused tools for the current markdown file.',
  'workspaceHome.singleEyebrow': 'Single file',
  'workspaceHome.workspaceGraph': 'Workspace graph',
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: keyof typeof translations) => translations[key] ?? key,
  }),
}))

vi.mock('@/components/AppLogo', () => ({
  default: ({ className }: { className?: string }) => (
    <span aria-label="Marklab logo" className={className} />
  ),
}))

type HeroProps = ComponentProps<typeof WorkspaceHomeHero>

const createProps = (overrides: Partial<HeroProps> = {}): HeroProps => ({
  indexReady: true,
  singleFileMode: false,
  workspaceName: 'Research Vault',
  workspacePath: 'D:\\notes\\research-vault',
  onOpenAllPages: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenFilePicker: vi.fn(),
  onOpenProjectPicker: vi.fn(),
  onOpenWorkspaceGraph: vi.fn(),
  onSearch: vi.fn(),
  ...overrides,
})

describe('WorkspaceHomeHero', () => {
  it('renders workspace mode chrome and forwards primary actions', () => {
    const props = createProps()

    render(<WorkspaceHomeHero {...props} />)

    expect(screen.getByLabelText('Marklab logo')).toHaveClass('size-11')
    expect(screen.getByText('Workspace')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Research Vault' })).toBeInTheDocument()
    expect(screen.getByText('Index ready')).toBeInTheDocument()
    expect(screen.getByText('D:\\notes\\research-vault')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Search workspace' }))
    fireEvent.click(screen.getByRole('button', { name: 'All pages' }))
    fireEvent.click(screen.getByRole('button', { name: 'Workspace graph' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }))

    expect(props.onSearch).toHaveBeenCalledTimes(1)
    expect(props.onOpenAllPages).toHaveBeenCalledTimes(1)
    expect(props.onOpenWorkspaceGraph).toHaveBeenCalledTimes(1)
    expect(props.onOpenProjectPicker).toHaveBeenCalledTimes(1)
  })

  it('keeps the single-document action disabled when no document is available', () => {
    const props = createProps({
      indexReady: false,
      singleFileMode: true,
      firstDocument: undefined,
    })

    render(<WorkspaceHomeHero {...props} />)

    expect(screen.getByText('Single file')).toBeInTheDocument()
    expect(screen.getByText('Indexing')).toBeInTheDocument()
    expect(screen.getByText('Use focused tools for the current markdown file.')).toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Open document' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Show in sidebar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open file' }))

    expect(props.onOpenFile).not.toHaveBeenCalled()
    expect(props.onSearch).toHaveBeenCalledTimes(1)
    expect(props.onOpenFilePicker).toHaveBeenCalledTimes(1)
  })

  it('opens the first document in single-file mode when available', () => {
    const props = createProps({
      firstDocument: 'D:\\notes\\research-vault\\index.md',
      singleFileMode: true,
    })

    render(<WorkspaceHomeHero {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open document' }))

    expect(props.onOpenFile).toHaveBeenCalledWith('D:\\notes\\research-vault\\index.md')
  })
})
