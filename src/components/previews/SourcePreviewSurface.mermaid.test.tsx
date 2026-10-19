import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SourcePreviewSurface from '@/components/previews/SourcePreviewSurface'
import { fsApi } from '@/services/fsApi'

vi.mock('@/services/fsApi', () => ({ fsApi: { readTextPreview: vi.fn() } }))
vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: unknown) => unknown) =>
    selector({ rootKind: 'external', rootPath: '/workspace' }),
}))
vi.mock('@/components/previews/MermaidPreview', () => ({
  default: ({ source }: { source: string }) => <div data-testid="mermaid">{source}</div>,
}))
vi.mock('@/components/previews/SpreadsheetPreviewSurface', () => ({
  default: ({ path, src }: { path: string; src?: string }) => (
    <div data-testid="spreadsheet" data-path={path} data-src={src} />
  ),
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const preview = (presentation: 'full' | 'embedded' | 'graph' = 'full') =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SourcePreviewSurface
        path="diagram.mermaid"
        title="diagram.mermaid"
        presentation={presentation}
      />
    </QueryClientProvider>,
  )

describe('standalone Mermaid file previews', () => {
  it('sends CSV snapshots directly to the paginated spreadsheet without a bounded source read', async () => {
    vi.mocked(fsApi.readTextPreview).mockClear()
    const src = 'marklab-asset://snapshot'
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SourcePreviewSurface path="data.csv" title="data.csv" src={src} />
      </QueryClientProvider>,
    )
    const spreadsheet = await screen.findByTestId('spreadsheet')
    expect(spreadsheet).toHaveAttribute('data-path', 'data.csv')
    expect(spreadsheet).toHaveAttribute('data-src', src)
    expect(fsApi.readTextPreview).not.toHaveBeenCalled()
  })

  it.each(['full', 'embedded'] as const)(
    'renders a complete %s diagram with the existing Mermaid preview',
    async (presentation) => {
      vi.mocked(fsApi.readTextPreview).mockResolvedValue({
        content: 'graph TD\nA --> B',
        truncated: false,
      })
      preview(presentation)
      expect(await screen.findByTestId('mermaid')).toHaveTextContent('A --> B')
    },
  )

  it.each([
    { presentation: 'full' as const, content: 'graph TD\nA --> B', truncated: true },
    { presentation: 'graph' as const, content: 'graph TD\nA --> B', truncated: false },
    { presentation: 'full' as const, content: 'x'.repeat(128 * 1024 + 1), truncated: false },
  ])(
    'keeps bounded source readable when rendering is unsuitable',
    async ({ presentation, content, truncated }) => {
      vi.mocked(fsApi.readTextPreview).mockResolvedValue({ content, truncated })
      preview(presentation)
      expect(await screen.findByRole('list', { name: 'preview.sourceLines' })).toBeInTheDocument()
      expect(screen.queryByTestId('mermaid')).not.toBeInTheDocument()
    },
  )
})
