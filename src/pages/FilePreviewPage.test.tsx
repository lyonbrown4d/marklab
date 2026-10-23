import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FilePreviewPage from '@/pages/FilePreviewPage'
import { fsApi } from '@/services/fsApi'

const layoutContextRef = vi.hoisted(() => ({ value: null as unknown }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: (selector: (state: never) => unknown) =>
    selector(layoutContextRef.value as never),
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    getPathMetadata: vi.fn(),
    openPathInSystem: vi.fn(),
    toAssetUrl: vi.fn(),
  },
}))

vi.mock('@/components/previews/FilePreviewSurface', () => ({
  default: ({ path, kind }: { path: string; kind: string }) => (
    <div data-testid="file-preview" data-path={path} data-kind={kind} />
  ),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'preview.loading': 'Loading preview...',
        'preview.openInSystem': 'Open in system',
      }
      return labels[key] ?? key
    },
  }),
}))

const renderPage = (path = 'assets/demo.png') => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/preview/${path}`]}>
        <Routes>
          <Route path="/preview/*" element={<FilePreviewPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('FilePreviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(fsApi.getPathMetadata).mockReturnValue(new Promise(() => undefined))
    vi.mocked(fsApi.toAssetUrl).mockResolvedValue({
      url: 'marklab-asset://local/v1/preview',
      expires_at_ms: Date.now() + 60_000,
    })
    layoutContextRef.value = {
      files: [{ kind: 'file', path: 'assets/demo.png' }],
      onOpenFile: vi.fn(),
    }
  })

  it('uses the shared preview loading status for metadata loading', () => {
    renderPage()

    const status = screen.getByRole('status', { name: 'Loading preview...' })
    const openButton = screen.getByRole('button', { name: 'Open in system' })

    expect(status).toHaveAttribute('aria-busy', 'true')
    const loadingLines = status.querySelector('[data-document-loading]')
    expect(loadingLines).toHaveAttribute('aria-hidden', 'true')
    expect(loadingLines?.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
    expect(openButton.querySelector('[data-icon="inline-start"]')).not.toBeNull()
  })

  it('loads a linked workbook even when its lazy tree directory has not been expanded', async () => {
    const path = 'docs/performance/rules/管理岗位评分规则.xlsx'
    layoutContextRef.value = {
      activePath: path,
      files: [{ kind: 'folder', path: 'docs' }],
      onOpenFile: vi.fn(),
      rootKind: 'external',
      rootPath: '/workspace',
    }
    vi.mocked(fsApi.getPathMetadata).mockResolvedValue({
      path,
      kind: 'file',
      readonly: false,
      size_bytes: 1_024,
    })

    renderPage(path)

    expect(await screen.findByTestId('file-preview')).toHaveAttribute('data-path', path)
    expect(screen.getByTestId('file-preview')).toHaveAttribute('data-kind', 'spreadsheet')
    expect(fsApi.getPathMetadata).toHaveBeenCalledWith(path)
    expect(fsApi.toAssetUrl).toHaveBeenCalledWith(path)
    expect(screen.queryByText('notFound.title')).not.toBeInTheDocument()
  })

  it('keeps rejecting an unknown preview route that is not the active file', () => {
    layoutContextRef.value = {
      activePath: 'README.md',
      files: [{ kind: 'file', path: 'README.md' }],
      onOpenFile: vi.fn(),
    }

    renderPage('missing.xlsx')

    expect(screen.getByText('notFound.title')).toBeInTheDocument()
    expect(fsApi.getPathMetadata).not.toHaveBeenCalled()
    expect(fsApi.toAssetUrl).not.toHaveBeenCalled()
  })

  it('reports a system open failure with its operation and recovery detail', async () => {
    vi.mocked(fsApi.openPathInSystem).mockRejectedValue(new Error('No application is available'))
    renderPage()

    fireEvent.click(screen.getByRole('button', { name: 'Open in system' }))

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('context.actionFailed', {
        description: 'Open in system: No application is available',
      }),
    )
  })
})
