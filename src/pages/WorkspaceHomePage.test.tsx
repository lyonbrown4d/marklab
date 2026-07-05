import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkspaceHomePage from '@/pages/WorkspaceHomePage'

const layoutContextRef = vi.hoisted(() => ({ value: null as unknown }))
const menuDispatchMock = vi.hoisted(() => vi.fn())

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: () => layoutContextRef.value,
}))

vi.mock('@/services/appApi', () => ({
  appApi: {
    menuDispatch: menuDispatchMock,
  },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const labels: Record<string, string> = {
        'actions.openFile': 'Open file',
        'actions.openProject': 'Open project',
        'sidebar.localWorkspace': 'Local workspace',
        'workspaceHome.allPages': 'All pages',
        'workspaceHome.builtInWorkspace': 'Built-in workspace',
        'workspaceHome.browseAllPages': 'Browse all pages',
        'workspaceHome.description': 'Project workspace overview.',
        'workspaceHome.documents': 'Documents',
        'workspaceHome.documentStats': '{{headings}} headings, {{links}} links',
        'workspaceHome.eyebrow': 'Workspace home',
        'workspaceHome.files': 'Files',
        'workspaceHome.findFileOrNote': 'Find file or note',
        'workspaceHome.foldersTracked': '{{count}} folders tracked',
        'workspaceHome.indexedMarkdownFiles': '{{count}} Markdown files indexed',
        'workspaceHome.indexPending': 'Index pending',
        'workspaceHome.indexReady': 'Index ready',
        'workspaceHome.indexing': 'Indexing',
        'workspaceHome.internalWorkspace': 'Internal workspace',
        'workspaceHome.issues': 'Issues',
        'workspaceHome.issuesCaption': 'Missing files, anchors, or assets',
        'workspaceHome.links': 'Links',
        'workspaceHome.linksCaption': 'Markdown and Wiki references',
        'workspaceHome.noDocumentYet': 'No document yet',
        'workspaceHome.noFiles': 'No files.',
        'workspaceHome.noRecentProjects': 'No recent projects.',
        'workspaceHome.openAnotherFile': 'Open another file',
        'workspaceHome.openDocument': 'Open {{name}}',
        'workspaceHome.openSingleDocument': 'Open current file',
        'workspaceHome.quickEntries': 'Quick entries',
        'workspaceHome.quickSubtitle': 'Project shortcuts.',
        'workspaceHome.recentProjects': 'Recent projects',
        'workspaceHome.recentSubtitle': 'Open recent workspaces.',
        'workspaceHome.searchWorkspace': 'Search workspace',
        'workspaceHome.showInSidebar': 'Show in sidebar',
        'workspaceHome.singleDescription': 'Single-file focused desktop.',
        'workspaceHome.singleEyebrow': 'Single-file desktop',
        'workspaceHome.singleFileCaption': 'Single-file mode',
        'workspaceHome.singleQuickSubtitle': 'Current file shortcuts.',
        'workspaceHome.titles': 'Headings',
        'workspaceHome.waitingForIndex': 'Waiting for index',
        'workspaceHome.workspaceGraph': 'Workspace graph',
      }
      const template = labels[key] ?? key

      return Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
        template,
      )
    },
  }),
}))

const renderPage = () =>
  render(
    <MemoryRouter>
      <WorkspaceHomePage />
    </MemoryRouter>,
  )

beforeEach(() => {
  menuDispatchMock.mockClear()
  layoutContextRef.value = {
    files: [{ kind: 'file', path: 'README.md' }],
    onOpenFile: vi.fn(),
    onOpenProject: vi.fn(),
    onUseInternalRoot: vi.fn(),
    recentProjects: [],
    rootKind: 'single',
    rootPath: 'C:/notes/README.md',
    workspaceIndex: {
      files: [
        {
          assets: [],
          headings: [{ slug: 'intro' }],
          links: [],
          path: 'README.md',
        },
      ],
    },
  }
})

describe('WorkspaceHomePage', () => {
  it('hides project-only actions in single-file mode and opens files through desktop menu', () => {
    renderPage()

    expect(screen.getByText('Single-file desktop')).toBeInTheDocument()
    expect(screen.getByText('Single-file focused desktop.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Workspace graph' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'All pages' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Open another file' }))

    expect(menuDispatchMock).toHaveBeenCalledWith('file.open_file')
  })

  it('keeps the current single file directly openable from the hero action', () => {
    const context = layoutContextRef.value as { onOpenFile: ReturnType<typeof vi.fn> }

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Open current file' }))

    expect(context.onOpenFile).toHaveBeenCalledWith('README.md')
  })

  it('offers local workspace switching from the overview projects panel', () => {
    const context = layoutContextRef.value as { onUseInternalRoot: ReturnType<typeof vi.fn> }

    renderPage()

    fireEvent.click(screen.getByRole('button', { name: /Local workspace/ }))

    expect(context.onUseInternalRoot).toHaveBeenCalledTimes(1)
  })
})
