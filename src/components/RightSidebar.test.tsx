import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, PropsWithChildren } from 'react'
import RightSidebar from '@/components/RightSidebar'
import { createRightSidebarInsights } from '@/components/rightSidebarTestFixtures'
import i18n from '@/i18n/setup'
import { workspaceAnalysisApi } from '@/services/workspaceAnalysisApi'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  onFocusHeadingRequest,
  onFocusSourcePositionRequest,
  type FocusHeadingRequest,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'
import {
  plateDiagnosticsStore,
  publishPlateDiagnostics,
} from '@/components/plate/plateDiagnosticsStore'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => false,
}))

vi.mock('@/services/workspaceAnalysisApi', () => ({
  workspaceAnalysisApi: { getDocumentInsights: vi.fn() },
}))

const analysisApi = vi.mocked(workspaceAnalysisApi)

type RightSidebarProps = ComponentProps<typeof RightSidebar>

const createProps = (overrides: Partial<RightSidebarProps> = {}): RightSidebarProps => ({
  collapsed: false,
  workspaceKey: 'external:D:/wiki',
  activePath: 'target.md',
  inspectedPath: null,
  editorValue: '# Target\n## Details\n',
  fileContents: {
    'target.md': '# Target\n## Details\n',
    'source.md': 'intro\nSee [Target](target.md) here\n',
  },
  tabs: ['target.md'],
  totalFiles: 2,
  onOpenFileView: vi.fn(),
  viewMode: 'wysiwyg',
  ...overrides,
})

const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return function QueryWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
}

const renderRightSidebar = (props: RightSidebarProps) =>
  render(<RightSidebar {...props} />, { wrapper: createQueryWrapper() })

beforeEach(async () => {
  localStorage.clear()
  analysisApi.getDocumentInsights.mockReset()
  analysisApi.getDocumentInsights.mockResolvedValue(createRightSidebarInsights())
  usePreferencesStore.setState({ locale: 'en-US' })
  plateDiagnosticsStore.setState({ current: null })
  await i18n.changeLanguage('en-US')
})

describe('RightSidebar', () => {
  it('dispatches a heading focus request when an outline item is clicked', async () => {
    const events: FocusHeadingRequest[] = []
    const unsubscribe = onFocusHeadingRequest((request) => events.push(request))

    try {
      renderRightSidebar(createProps())

      const headingButton = (await screen.findByText('Details')).closest('button')
      expect(headingButton).toBeInTheDocument()
      fireEvent.click(headingButton!)

      await waitFor(() => {
        expect(events).toEqual([
          { path: 'target.md', slug: 'details', workspaceKey: 'external:D:/wiki' },
        ])
      })
    } finally {
      unsubscribe()
    }
  })

  it('filters outline headings by text or slug and keeps heading navigation', async () => {
    const events: FocusHeadingRequest[] = []
    const unsubscribe = onFocusHeadingRequest((request) => events.push(request))

    try {
      analysisApi.getDocumentInsights.mockResolvedValue(
        createRightSidebarInsights({
          headings: [
            { path: 'target.md', level: 1, text: 'Target', slug: 'target', line: 1, column: 1 },
            { path: 'target.md', level: 2, text: 'Details', slug: 'details', line: 2, column: 1 },
            {
              path: 'target.md',
              level: 2,
              text: 'Release Notes',
              slug: 'release-notes',
              line: 3,
              column: 1,
            },
          ],
        }),
      )
      renderRightSidebar(
        createProps({
          editorValue: '# Target\n## Details\n## Release Notes\n',
          fileContents: {
            'target.md': '# Target\n## Details\n## Release Notes\n',
            'source.md': 'intro\nSee [Target](target.md) here\n',
          },
        }),
      )

      const filterInput = await screen.findByRole('searchbox', {
        name: /filter headings or slugs/i,
      })

      await userEvent.type(filterInput, 'release-notes')

      expect(screen.getByText('Release Notes')).toBeInTheDocument()
      expect(screen.queryByText('Details')).not.toBeInTheDocument()

      const headingButton = screen.getByText('Release Notes').closest('button')
      expect(headingButton).toBeInTheDocument()
      fireEvent.click(headingButton!)

      await waitFor(() => {
        expect(events).toEqual([
          { path: 'target.md', slug: 'release-notes', workspaceKey: 'external:D:/wiki' },
        ])
      })

      await userEvent.clear(filterInput)
      await userEvent.type(filterInput, 'missing-slug')

      expect(await screen.findByText('No matching headings')).toBeInTheDocument()
    } finally {
      unsubscribe()
    }
  })

  it('keeps inspector tabs accessible while switching sections', async () => {
    renderRightSidebar(createProps())

    const outlineTab = screen.getByRole('tab', { name: /outline/i })
    const backlinksTab = screen.getByRole('tab', { name: /backlinks/i })

    expect(outlineTab).toHaveAttribute('aria-selected', 'true')

    await userEvent.click(backlinksTab)

    expect(outlineTab).toHaveAttribute('aria-selected', 'false')
    expect(backlinksTab).toHaveAttribute('aria-selected', 'true')
  })

  it('shows empty inspector states when a document has no outline or backlinks', async () => {
    analysisApi.getDocumentInsights.mockResolvedValue(
      createRightSidebarInsights({ headings: [], backlinks: [] }),
    )
    renderRightSidebar(
      createProps({
        editorValue: 'Plain text only',
        fileContents: { 'target.md': 'Plain text only' },
      }),
    )

    expect(await screen.findByText('No headings')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /backlinks/i }))

    expect(await screen.findByText('No backlinks')).toBeInTheDocument()
  })

  it('shows backlinks with context and opens the source location', async () => {
    const onOpenFileView = vi.fn()
    const props = createProps({ onOpenFileView })
    const events: FocusSourcePositionRequest[] = []
    const unsubscribe = onFocusSourcePositionRequest((request) => events.push(request))

    try {
      const { rerender } = renderRightSidebar(props)

      await userEvent.click(screen.getByRole('tab', { name: /backlinks/i }))

      expect(await screen.findByText('source')).toBeInTheDocument()
      expect(screen.getByText('See [Target](target.md) here')).toBeInTheDocument()

      const backlinkButton = screen.getByText('source').closest('button')
      expect(backlinkButton).toBeInTheDocument()
      fireEvent.click(backlinkButton!)

      expect(onOpenFileView).toHaveBeenCalledWith('source.md', 'source')

      rerender(
        <RightSidebar
          {...props}
          activePath="source.md"
          inspectedPath="target.md"
          viewMode="source"
        />,
      )

      await waitFor(() => {
        expect(events).toEqual([
          {
            path: 'source.md',
            line: 2,
            column: 5,
            workspaceKey: 'external:D:/wiki',
          },
        ])
      })
    } finally {
      unsubscribe()
    }
  })

  it('lists markdown link problems and switches to source on click', async () => {
    const onOpenFileView = vi.fn()
    analysisApi.getDocumentInsights.mockResolvedValue(
      createRightSidebarInsights({
        diagnostics: [
          {
            line: 3,
            start_column: 2,
            end_column: 12,
            message: 'Cannot find linked file "missing.md"',
            severity: 'error',
          },
          {
            line: 4,
            start_column: 2,
            end_column: 17,
            message: 'Cannot find heading "missing-anchor" in target.md',
            severity: 'warning',
          },
          {
            line: 5,
            start_column: 3,
            end_column: 10,
            message: 'Cannot find linked note "Unknown"',
            severity: 'error',
          },
        ],
      }),
    )
    renderRightSidebar(
      createProps({
        activePath: 'target.md',
        inspectedPath: 'target.md',
        editorValue:
          '# Target\n\n[missing](missing.md)\n[missing-heading](#missing-anchor)\n[[Unknown]]\n',
        onOpenFileView,
        viewMode: 'wysiwyg',
      }),
    )

    await userEvent.click(screen.getByRole('tab', { name: /problems/i }))

    expect((await screen.findAllByText('Error')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Warning').length).toBeGreaterThan(0)
    expect(screen.getByText('Cannot find linked file "missing.md"')).toBeInTheDocument()
    expect(screen.getByText('Cannot find linked note "Unknown"')).toBeInTheDocument()

    const errorButton = screen.getByText('Cannot find linked file "missing.md"').closest('button')
    expect(errorButton).toBeInTheDocument()
    fireEvent.click(errorButton!)

    expect(onOpenFileView).toHaveBeenCalledWith('target.md', 'source')
  })

  it('navigates live problems in the rich editor and applies an explicit quick fix', async () => {
    const onOpenFileView = vi.fn()
    const focus = vi.fn(() => true)
    const action = {
      kind: 'replace-text' as const,
      title: 'Remove missing heading anchor',
      edit: {
        path: 'target.md',
        line: 1,
        startColumn: 20,
        endColumn: 28,
        newText: '',
      },
    }
    const applyAction = vi.fn().mockResolvedValue(true)
    const getActions = vi.fn().mockResolvedValue([action])
    const liveProblem = {
      line: 1,
      startColumn: 15,
      endColumn: 28,
      message: 'Live missing anchor',
      severity: 'warning' as const,
    }
    publishPlateDiagnostics({
      key: 'right-sidebar-live',
      workspaceKey: 'external:D:/wiki',
      path: 'target.md',
      content: '[Target](target.md#missing)',
      diagnostics: [liveProblem],
      applyAction,
      focus,
      getActions,
    })
    renderRightSidebar(createProps({ onOpenFileView }))
    await userEvent.click(screen.getByRole('tab', { name: /problems/i }))

    fireEvent.click(await screen.findByText('Live missing anchor'))
    expect(onOpenFileView).toHaveBeenCalledWith('target.md', 'edit')
    expect(focus).toHaveBeenCalledWith(liveProblem)

    await userEvent.click(screen.getByRole('button', { name: /More.*Live missing anchor/ }))
    await userEvent.click(await screen.findByText('Remove missing heading anchor'))
    expect(getActions).toHaveBeenCalledWith(liveProblem)
    expect(applyAction).toHaveBeenCalledWith(liveProblem, action)
  })
})
