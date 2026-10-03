import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetchLinkPreview = vi.hoisted(() => vi.fn())

vi.mock('@/services/linkPreviewApi', () => ({
  linkPreviewApi: { fetch: fetchLinkPreview },
}))

import ExternalLinkPreview from '@/components/previews/ExternalLinkPreview'

const renderPreview = (url = 'https://example.com/article') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ExternalLinkPreview title="Article" url={url} />
    </QueryClientProvider>,
  )
}

describe('ExternalLinkPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('waits for hover or focus before fetching and renders webpage metadata as text', async () => {
    fetchLinkPreview.mockResolvedValue({
      canonical: null,
      description: '<img src=x onerror=alert(1)> Plain description',
      favicon: null,
      image: null,
      kind: 'webpage',
      site_name: 'Example Site',
      title: '<script>alert(1)</script> Article title',
      url: 'https://example.com/article',
    })
    renderPreview()

    expect(fetchLinkPreview).not.toHaveBeenCalled()
    fireEvent.pointerEnter(screen.getByRole('article'))

    expect(await screen.findByText('<script>alert(1)</script> Article title')).toBeVisible()
    expect(screen.getByText('<img src=x onerror=alert(1)> Plain description')).toBeVisible()
    expect(document.querySelector('script')).toBeNull()
    expect(fetchLinkPreview).toHaveBeenCalledExactlyOnceWith('https://example.com/article')
  })

  it('renders a verified image lazily with no referrer', async () => {
    fetchLinkPreview.mockResolvedValue({
      kind: 'image',
      media_type: 'image/png',
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url: 'https://example.com/image',
    })
    renderPreview('https://example.com/image')

    const article = screen.getByRole('article')
    expect(article).not.toHaveAttribute('tabindex')
    fireEvent.focus(screen.getByRole('link'))
    const image = await screen.findByRole('img', { name: 'Article' })
    expect(image).toHaveAttribute(
      'src',
      'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    expect(image).toHaveAttribute('loading', 'lazy')
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('keeps an openable fallback when preview fetching fails', async () => {
    fetchLinkPreview.mockRejectedValue(new Error('offline'))
    renderPreview()

    fireEvent.pointerEnter(screen.getByRole('article'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible())
    expect(screen.getByRole('link', { name: /Article/ })).toHaveAttribute(
      'href',
      'https://example.com/article',
    )
  })
})
