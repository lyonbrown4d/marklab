import type { ReactNode } from 'react'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppWorkspacePanels } from '@/app/AppWorkspacePanels'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import type { FileViewKind } from '@/store/appTypes'

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
  loadingPaths: {},
  movePath: action,
  onPersistedContentChange: persistedContentChange,
  onInspectPath: action,
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
  workspaceKey: 'external:/notes',
  onCloseTab: action,
  onOpenTab: action,
}

const renderPanels = (
  state: typeof baseState,
  callbacks: {
    onOpenFile?: (path: string) => void
    onOpenFileView?: (path: string, view: FileViewKind) => void
    onOpenSearchResult?: typeof action
  } = {},
  outlet: ReactNode = <main>Editor</main>,
) => (
  <AppWorkspacePanels
    state={state as never}
    outlet={outlet}
    totalFiles={1}
    onOpenFile={callbacks.onOpenFile ?? action}
    onOpenFileView={callbacks.onOpenFileView ?? action}
    onOpenGitDiff={action}
    onOpenSearchResult={callbacks.onOpenSearchResult ?? action}
    immersiveZenMode={false}
  />
)

describe('AppWorkspacePanels render isolation', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    renderSpies.inspector.mockClear()
    renderSpies.shell.mockClear()
    renderSpies.sidebar.mockClear()
    action.mockClear()
    persistedContentChange.mockClear()
    usePreferencesStore.setState({ sidebarCollapsed: false })
  })

  it('keeps the sidebar open while the selected file is still loading', () => {
    const onOpenFile = vi.fn()
    render(renderPanels(baseState, { onOpenFile }))
    const sidebarProps = renderSpies.sidebar.mock.calls.at(-1)?.[0] as {
      onOpenFile: (path: string) => void
    }

    sidebarProps.onOpenFile('/notes/two.md')

    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('/notes/two.md')
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
  })

  it('keeps the sidebar open when the file-tree open callback throws', () => {
    const failure = new Error('open failed')
    render(
      renderPanels(baseState, {
        onOpenFile: () => {
          throw failure
        },
      }),
    )
    const sidebarProps = renderSpies.sidebar.mock.calls.at(-1)?.[0] as {
      onOpenFile: (path: string) => void
    }

    expect(() => sidebarProps.onOpenFile('/notes/missing.md')).toThrow(failure)
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
  })

  it('keeps the sidebar open when the explicit file-view callback throws', () => {
    const failure = new Error('open source failed')
    render(
      renderPanels(baseState, {
        onOpenFileView: () => {
          throw failure
        },
      }),
    )
    const sidebarProps = renderSpies.sidebar.mock.calls.at(-1)?.[0] as {
      onOpenFileView: (path: string, view: 'source') => void
    }

    expect(() => sidebarProps.onOpenFileView('/notes/missing.md', 'source')).toThrow(failure)
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
  })

  it('waits for explicit file-tree views without affecting other sidebar navigation', () => {
    const onOpenFileView = vi.fn()
    const onOpenSearchResult = vi.fn()
    render(renderPanels(baseState, { onOpenFileView, onOpenSearchResult }))
    const sidebarProps = renderSpies.sidebar.mock.calls.at(-1)?.[0] as {
      onOpenGitDiff: (request: { path: string; section: 'unstaged' }) => void
      onOpenFileView: (path: string, view: 'source') => void
      onOpenSearchResult: (result: { path: string }) => void
      onRestoreHistoryContent: (path: string, content: string) => void
    }

    sidebarProps.onOpenSearchResult({ path: '/notes/search.md' })
    sidebarProps.onOpenGitDiff({ path: '/notes/two.md', section: 'unstaged' })
    sidebarProps.onRestoreHistoryContent('/notes/one.md', 'restored')
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)

    sidebarProps.onOpenFileView('/notes/two.md', 'source')
    expect(onOpenFileView).toHaveBeenCalledExactlyOnceWith('/notes/two.md', 'source')
    expect(usePreferencesStore.getState().sidebarCollapsed).toBe(false)
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

  it('commits the workspace map when leaving an active file tab', () => {
    vi.useFakeTimers()
    const { rerender } = render(renderPanels(baseState))

    rerender(
      renderPanels({ ...baseState, workspaceView: 'map' }, {}, <main>Workspace map canvas</main>),
    )
    act(() => vi.advanceTimersByTime(140))

    expect(screen.getByText('Workspace map canvas')).toBeVisible()
    expect(screen.queryByText('Editor')).not.toBeInTheDocument()
  })

  it('keeps the previous editor visible while the selected tab loads', () => {
    const { rerender } = render(renderPanels(baseState))
    const loadingState = {
      ...baseState,
      activePath: '/notes/two.md',
      activeTabId: 'file:edit:/notes/two.md',
      loadingPaths: { '/notes/two.md': true as const },
      tabs: [{ kind: 'file' as const, view: 'edit' as const, path: '/notes/two.md' }],
    }

    rerender(
      <AppWorkspacePanels
        state={loadingState as never}
        outlet={<main>Second editor</main>}
        totalFiles={1}
        onOpenFile={action}
        onOpenFileView={action}
        onOpenGitDiff={action}
        onOpenSearchResult={action}
        immersiveZenMode={false}
      />,
    )

    expect(screen.getByText('Editor')).toBeVisible()
    expect(screen.queryByText('Second editor')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('editor.transition.loading')
  })
})
