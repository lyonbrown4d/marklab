import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FilePreviewPage from '@/pages/FilePreviewPage'
import { fsApi } from '@/services/fsApi'

const layoutContextRef = vi.hoisted(() => ({ value: null as unknown }))

vi.mock('@/pages/useLayoutContext', () => ({
  useLayoutContext: () => layoutContextRef.value,
}))

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    getPathMetadata: vi.fn(),
    openPathInSystem: vi.fn(),
  },
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

const renderPage = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/preview/assets/demo.png']}>
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
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
    expect(openButton.querySelector('[data-icon="inline-start"]')).not.toBeNull()
  })
})
