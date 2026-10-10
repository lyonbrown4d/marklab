import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef, useState, type ComponentProps } from 'react'
import Titlebar from '@/components/Titlebar'
import type { TitlebarHandle } from '@/components/Titlebar'
import {
  useNativeSurfaceOcclusion,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'

vi.mock('@/runtime/window', () => ({
  isDesktopRuntime: () => false,
  getCurrentRuntimeWindow: async () => null,
}))

vi.mock('@/runtime/environment', () => ({
  inferPlatformFromUserAgent: () => 'windows',
  isDesktopRuntime: () => false,
}))

type TitlebarProps = ComponentProps<typeof Titlebar>

const createProps = (): TitlebarProps => ({
  activePath: 'notes/target.md',
  activeTab: { kind: 'file', path: 'notes/target.md', view: 'edit' },
  tabs: [],
  onToggleSidebar: vi.fn(),
  onToggleRightSidebar: vi.fn(),
  onSelectProject: vi.fn(),
  onSelectSingleFile: vi.fn(),
  onCreateFile: vi.fn(),
  onCreateFolder: vi.fn(),
  onOpenFile: vi.fn(),
  onOpenHeading: vi.fn(),
  onOpenSearchResult: vi.fn(),
  onOpenWorkspaceGraph: vi.fn(),
  onOpenAllPages: vi.fn(),
  onOpenProject: vi.fn(),
  onOpenCurrentWorkspaceInNewWindow: vi.fn(),
  onSelectWorkspaceInNewWindow: vi.fn(),
  onToggleReadOnly: vi.fn(),
  onCloseActiveTab: vi.fn(),
  onOpenTerminal: vi.fn(),
  onRebuildSearchIndex: vi.fn(),
  onChangeView: vi.fn(),
  viewMode: 'wysiwyg',
  files: [{ path: 'notes/target.md', kind: 'file' }],
  workspaceKey: 'external:/workspace',
  canCreateWorkspaceEntries: true,
  searchIndexRebuilding: false,
  isMaximized: false,
  setIsMaximized: vi.fn(),
  theme: 'paper',
  setTheme: vi.fn(),
  commandOpen: undefined,
  onCommandOpenChange: undefined,
  onOpenSettings: vi.fn(),
  recentProjects: [],
  rootPath: 'C:/workspace',
  rootKind: 'external',
  workspaceWindowOpening: false,
})

const tapShift = () => {
  fireEvent.keyDown(window, { key: 'Shift' })
  fireEvent.keyUp(window, { key: 'Shift' })
}

const BlockingSurfaceHarness = () => {
  useNativeSurfaceOcclusion('settings-dialog', true, { blocksCommandPalette: true })
  return <Titlebar {...createProps()} />
}

const ReverseBlockingSurfaceHarness = () => {
  const [commandOpen, setCommandOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useNativeSurfaceOcclusion('settings-dialog', settingsOpen, { blocksCommandPalette: true })
  return (
    <>
      <button type="button" onClick={() => setSettingsOpen(true)}>
        Open settings
      </button>
      <Titlebar {...createProps()} commandOpen={commandOpen} onCommandOpenChange={setCommandOpen} />
    </>
  )
}

describe('Titlebar double-Shift shortcut', () => {
  beforeEach(() => {
    useNativeSurfaceOcclusionStore.setState({
      reasons: {},
      commandPaletteBlockers: {},
    })
  })

  it('opens the existing command dialog in quick-open mode after the second tap', async () => {
    // This test exercises the shortcut/mode contract, not the lazy chunk timing.
    await import('@/components/TitlebarCommandDialog')
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <Titlebar {...createProps()} />
      </QueryClientProvider>,
    )

    tapShift()
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()

    tapShift()
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: 'Quick open' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('opens from a non-modal navigation drawer that stops bubbling keyboard events', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <Titlebar {...createProps()} />
        <div aria-label="Navigation drawer" role="dialog">
          <input
            aria-label="File filter"
            onKeyDown={(event) => event.stopPropagation()}
            onKeyUp={(event) => event.stopPropagation()}
          />
        </div>
      </QueryClientProvider>,
    )

    const input = screen.getByRole('textbox', { name: 'File filter' })
    fireEvent.keyDown(input, { key: 'Shift' })
    fireEvent.keyUp(input, { key: 'Shift' })
    fireEvent.keyDown(input, { key: 'Shift' })
    fireEvent.keyUp(input, { key: 'Shift' })

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()
  })

  it('does not take keyboard priority from an explicitly blocking surface', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <BlockingSurfaceHarness />
      </QueryClientProvider>,
    )

    tapShift()
    tapShift()

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
  })

  it('blocks imperative shortcut entry points while a modal surface owns focus', () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const titlebarRef = createRef<TitlebarHandle>()
    const BlockingImperativeHarness = () => {
      useNativeSurfaceOcclusion('settings-dialog', true, { blocksCommandPalette: true })
      return <Titlebar {...createProps()} ref={titlebarRef} />
    }
    render(
      <QueryClientProvider client={queryClient}>
        <BlockingImperativeHarness />
      </QueryClientProvider>,
    )

    act(() => titlebarRef.current?.openCommandPalette())

    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument()
  })

  it('closes an open command palette when a blocking surface becomes active', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <ReverseBlockingSurfaceHarness />
      </QueryClientProvider>,
    )
    const openSettings = screen.getByRole('button', { name: 'Open settings' })
    tapShift()
    tapShift()
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument()

    fireEvent.click(openSettings)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument(),
    )
  })
})
