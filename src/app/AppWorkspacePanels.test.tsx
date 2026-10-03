import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppWorkspacePanels } from '@/app/AppWorkspacePanels'

const renderSpies = vi.hoisted(() => ({
  inspector: vi.fn(),
  shell: vi.fn(),
  sidebar: vi.fn(),
}))

vi.mock('@/components/Sidebar', () => ({
  default: (props: unknown) => {
    renderSpies.sidebar(props)
    return <div>Sidebar</div>
  },
}))

vi.mock('@/components/RightSidebar', () => ({
  default: (props: unknown) => {
    renderSpies.inspector(props)
    return <div>Inspector</div>
  },
}))

vi.mock('@/components/ImmersiveWorkspaceShell', () => ({
  ImmersiveWorkspaceShell: (props: {
    children: ReactNode
    inspector: ReactNode
    sidebar: ReactNode
  }) => {
    renderSpies.shell(props)
    return (
      <>
        {props.sidebar}
        {props.inspector}
        {props.children}
      </>
    )
  },
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const action = vi.fn()
const persistedContentChange = vi.fn()
const baseState = {
  activePath: '/notes/one.md',
  activeTabId: 'file:edit:/notes/one.md',
  activeResourcePath: '/notes/one.md',
  createFile: action,
  createFolder: action,
  deletePath: action,
  dirtyPaths: new Set<string>(),
  editorValue: 'first',
  fileContents: { '/notes/one.md': 'first' },
  fileTree: [],
  files: [],
  inspectedPath: '/notes/one.md',
  movePath: action,
  onPersistedContentChange: persistedContentChange,
  onInspectPath: action,
  onOpenProject: action,
  onOpenWorkspaceGraph: action,
  onSelectProject: action,
  onUseInternalRoot: action,
  recentProjects: [],
  renamePath: action,
  rightSidebarCollapsed: false,
  rootKind: 'internal',
  rootPath: '/notes',
  saveStates: {},
  sidebarCollapsed: false,
  silentSave: true,
  tabs: [{ kind: 'file' as const, view: 'edit' as const, path: '/notes/one.md' }],
  viewMode: 'wysiwyg',
  workspaceView: 'files' as 'files' | 'map',
  workspaceIndex: null,
  onCloseTab: action,
  onOpenTab: action,
}

const renderPanels = (state: typeof baseState) => (
  <AppWorkspacePanels
    state={state as never}
    outlet={<main>Editor</main>}
    totalFiles={1}
    onOpenFile={action}
    onOpenFileView={action}
    onOpenGitDiff={action}
    onOpenSearchResult={action}
    immersiveZenMode={false}
  />
)

describe('AppWorkspacePanels render isolation', () => {
  beforeEach(() => {
    renderSpies.inspector.mockClear()
    renderSpies.shell.mockClear()
    renderSpies.sidebar.mockClear()
    persistedContentChange.mockClear()
  })

  it('does not rerender the sidebar for editor buffers while the inspector updates', () => {
    const { rerender } = render(renderPanels(baseState))

    rerender(renderPanels({ ...baseState, editorValue: 'second' }))
    rerender(
      renderPanels({
        ...baseState,
        editorValue: 'second',
        fileContents: { '/notes/one.md': 'second' },
      }),
    )
    expect(renderSpies.sidebar).toHaveBeenCalledTimes(1)
    expect(renderSpies.inspector).toHaveBeenCalledTimes(3)
  })

  it('keeps persistent panel toggle callbacks stable across buffer updates', () => {
    const { rerender } = render(renderPanels(baseState))
    const firstProps = renderSpies.shell.mock.calls.at(-1)?.[0] as Record<string, unknown>

    rerender(renderPanels({ ...baseState, editorValue: 'second' }))
    const nextProps = renderSpies.shell.mock.calls.at(-1)?.[0] as Record<string, unknown>

    expect(nextProps.onToggleSidebar).toBe(firstProps.onToggleSidebar)
    expect(nextProps.onSidebarOpenChange).toBe(firstProps.onSidebarOpenChange)
    expect(nextProps.onToggleInspector).toBe(firstProps.onToggleInspector)
  })

  it('routes active history restores through the persisted-content callback', () => {
    render(renderPanels(baseState))
    const sidebarProps = renderSpies.sidebar.mock.calls.at(-1)?.[0] as {
      onRestoreHistoryContent: (path: string, content: string) => void
    }

    sidebarProps.onRestoreHistoryContent('/notes/one.md', 'restored')
    sidebarProps.onRestoreHistoryContent('/notes/other.md', 'ignored')

    expect(persistedContentChange).toHaveBeenCalledOnce()
    expect(persistedContentChange).toHaveBeenCalledWith('/notes/one.md', 'restored')
  })

  it('mounts the immersive tabs dock over the workspace content', () => {
    render(renderPanels(baseState))

    expect(screen.getByTestId('tabs-dock')).toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })

  it('hides the file tabs dock while the workspace map is active', () => {
    render(renderPanels({ ...baseState, workspaceView: 'map' }))

    expect(screen.queryByTestId('tabs-dock')).not.toBeInTheDocument()
    expect(screen.getByText('Editor')).toBeInTheDocument()
  })
})
