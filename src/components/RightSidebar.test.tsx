import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps, PropsWithChildren } from 'react'
import RightSidebar from '@/components/RightSidebar'
import i18n from '@/i18n/setup'
import { usePreferencesStore } from '@/store/usePreferencesStore'
import {
  onFocusHeadingRequest,
  onFocusSourcePositionRequest,
  type FocusHeadingRequest,
  type FocusSourcePositionRequest,
} from '@/utils/editorNavigation'

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => false,
}))

type RightSidebarProps = ComponentProps<typeof RightSidebar>

const baseFiles = [
  { path: 'target.md', kind: 'file' },
  { path: 'source.md', kind: 'file' },
] satisfies RightSidebarProps['files']

const workspaceIndex = {
  files: [
    {
      path: 'target.md',
      headings: [
        { path: 'target.md', level: 1, text: 'Indexed Target', slug: 'indexed-target', line: 1 },
        { path: 'target.md', level: 2, text: 'Indexed Detail', slug: 'indexed-detail', line: 2 },
      ],
      links: [],
    },
    {
      path: 'source.md',
      headings: [],
      links: [
        {
          source_path: 'source.md',
          text: 'Target',
          target: 'target.md',
          link_type: 'markdown',
          target_path: 'target.md',
          target_anchor: null,
          target_heading_slug: null,
          is_external: false,
          context: 'See [Target](target.md) from index',
          line: 3,
          column: 5,
        },
      ],
    },
  ],
} satisfies NonNullable<RightSidebarProps['workspaceIndex']>

const createProps = (overrides: Partial<RightSidebarProps> = {}): RightSidebarProps => ({
  collapsed: false,
  activePath: 'target.md',
  inspectedPath: null,
  editorValue: '# Target\n## Details\n',
  files: baseFiles,
  fileContents: {
    'target.md': '# Target\n## Details\n',
    'source.md': 'intro\nSee [Target](target.md) here\n',
  },
  tabs: ['target.md'],
  totalFiles: 2,
  onOpenFileView: vi.fn(),
  workspaceIndex: null,
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
  usePreferencesStore.setState({ locale: 'en-US' })
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
        expect(events).toEqual([{ path: 'target.md', slug: 'details' }])
      })
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
    renderRightSidebar(
      createProps({
        editorValue: 'Plain text only',
        fileContents: { 'target.md': 'Plain text only' },
        files: [{ path: 'target.md', kind: 'file' }],
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
        expect(events).toEqual([{ path: 'source.md', line: 2, column: 5 }])
      })
    } finally {
      unsubscribe()
    }
  })

  it('uses the shared workspace index for inspected outline and backlinks', async () => {
    renderRightSidebar(
      createProps({
        activePath: 'source.md',
        inspectedPath: 'target.md',
        editorValue: '# Source\n',
        fileContents: {},
        workspaceIndex,
      }),
    )

    expect(screen.getByText('Indexed Detail')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('tab', { name: /backlinks/i }))

    expect(await screen.findByText('source')).toBeInTheDocument()
    expect(screen.getByText('See [Target](target.md) from index')).toBeInTheDocument()
  })

  it('lists markdown link problems and switches to source on click', async () => {
    const onOpenFileView = vi.fn()
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
})
