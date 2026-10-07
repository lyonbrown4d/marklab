import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import Titlebar from '@/components/Titlebar'

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
  workspaceIndex: null,
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

describe('Titlebar double-Shift shortcut', () => {
  it('opens the existing command dialog in quick-open mode after the second tap', async () => {
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
})
