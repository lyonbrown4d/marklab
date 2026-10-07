import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fetchLinkPreview = vi.hoisted(() => vi.fn())
const captureLinkPreview = vi.hoisted(() => vi.fn())
const openWebTab = vi.hoisted(() => vi.fn())
const cancelCapture = vi.hoisted(() => vi.fn())
const enqueueCapture = vi.hoisted(() => vi.fn(({ run }: { run: () => Promise<unknown> }) => run()))
const promoteCapture = vi.hoisted(() => vi.fn())

vi.mock('@/services/linkPreviewApi', () => ({
  linkPreviewApi: { capture: captureLinkPreview, fetch: fetchLinkPreview },
}))

vi.mock('@/app/useOpenWebTab', () => ({
  useOpenWebTab: () => openWebTab,
}))

vi.mock('@/components/previews/previewCaptureQueue', () => ({
  previewCaptureQueue: {
    cancel: cancelCapture,
    enqueue: enqueueCapture,
    promote: promoteCapture,
  },
}))

import ExternalLinkPreview from '@/components/previews/ExternalLinkPreview'
import { retainPreviewCaptureDemand } from '@/components/previews/useExternalWebPreviewData'

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
    captureLinkPreview.mockRejectedValue(new Error('capture unavailable'))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('cancels a shared capture only after the final consumer releases it', () => {
    const releaseFirst = retainPreviewCaptureDemand('https://example.com/shared')
    const releaseSecond = retainPreviewCaptureDemand('https://example.com/shared')

    releaseFirst()
    expect(cancelCapture).not.toHaveBeenCalled()
    releaseSecond()
    expect(cancelCapture).toHaveBeenCalledExactlyOnceWith('https://example.com/shared')
  })

  it('loads metadata when visible and manages capture as cancellable background work', async () => {
    let observe: IntersectionObserverCallback | undefined
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observe = callback
        }
        disconnect = disconnect
        observe = vi.fn()
        unobserve = vi.fn()
        root = null
        rootMargin = ''
        thresholds = []
        takeRecords = () => []
      },
    )
    fetchLinkPreview.mockResolvedValue({
      canonical: null,
      description: null,
      favicon: null,
      image: null,
      kind: 'webpage',
      site_name: 'Example',
      title: 'Visible article',
      url: 'https://example.com/article',
    })
    renderPreview()

    act(() =>
      observe?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )
    await screen.findByText('Visible article')
    await waitFor(() => expect(enqueueCapture).toHaveBeenCalledOnce())
    expect(enqueueCapture).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'https://example.com/article',
        priority: 'background',
      }),
    )

    fireEvent.pointerEnter(screen.getByRole('article'))
    expect(promoteCapture).toHaveBeenCalledWith('https://example.com/article')
    act(() =>
      observe?.(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )
    fireEvent.pointerLeave(screen.getByRole('article'))
    expect(cancelCapture).toHaveBeenCalledWith('https://example.com/article')
    expect(disconnect).not.toHaveBeenCalled()
  })

  it('retries a backpressured capture when the card becomes interactive', async () => {
    let observe: IntersectionObserverCallback | undefined
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          observe = callback
        }
        disconnect = vi.fn()
        observe = vi.fn()
        unobserve = vi.fn()
        root = null
        rootMargin = ''
        thresholds = []
        takeRecords = () => []
      },
    )
    fetchLinkPreview.mockResolvedValue({
      kind: 'webpage',
      site_name: 'Example',
      title: 'Backpressured article',
      url: 'https://example.com/article',
    })
    let rejectBackpressure!: (error: Error) => void
    enqueueCapture
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectBackpressure = reject
        }),
      )
      .mockImplementationOnce(({ run }: { run: () => Promise<unknown> }) => run())
    captureLinkPreview.mockResolvedValue({
      height: 360,
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url: 'https://example.com/article',
      width: 640,
    })
    renderPreview()

    act(() =>
      observe?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      ),
    )
    await waitFor(() => expect(enqueueCapture).toHaveBeenCalledOnce())
    fireEvent.pointerEnter(screen.getByRole('article'))
    const queueError = new Error('queue full')
    queueError.name = 'PreviewCaptureQueueFullError'
    rejectBackpressure(queueError)

    await waitFor(() => expect(enqueueCapture).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('img', { name: 'Article preview' })).toBeVisible()
  })

  it('offers an explicit in-app action for webpages', async () => {
    fetchLinkPreview.mockResolvedValue({
      canonical: null,
      description: 'Reference material',
      favicon: null,
      image: null,
      kind: 'webpage',
      site_name: 'Example Site',
      title: 'Article title',
      url: 'https://example.com/article',
    })
    renderPreview()

    const preview = screen.getByRole('article', { name: 'Article' })
    fireEvent.pointerEnter(preview)
    await screen.findByText('Article title')
    fireEvent.click(screen.getByRole('button', { name: 'Open in app' }))

    expect(openWebTab).toHaveBeenCalledWith('https://example.com/article', 'Article title')
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

  it('retries both metadata and visual capture from the failed card', async () => {
    fetchLinkPreview.mockRejectedValue(new Error('offline'))
    renderPreview()

    fireEvent.pointerEnter(screen.getByRole('article'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible())
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await waitFor(() => expect(fetchLinkPreview).toHaveBeenCalledTimes(2))
    expect(captureLinkPreview).toHaveBeenCalledTimes(2)
  })

  it('progressively renders a native visual capture without delaying metadata', async () => {
    fetchLinkPreview.mockResolvedValue({
      canonical: null,
      description: 'Reference material',
      favicon: null,
      image: null,
      kind: 'webpage',
      site_name: 'Example Site',
      title: 'Article title',
      url: 'https://example.com/article',
    })
    captureLinkPreview.mockResolvedValue({
      height: 360,
      src: 'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      url: 'https://example.com/article',
      width: 640,
    })
    renderPreview()

    fireEvent.pointerEnter(screen.getByRole('article'))

    expect(await screen.findByText('Article title')).toBeVisible()
    expect(await screen.findByRole('img', { name: 'Article preview' })).toHaveAttribute(
      'src',
      'marklab-asset://remote/v1/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    )
    expect(captureLinkPreview).toHaveBeenCalledExactlyOnceWith('https://example.com/article')
  })
})
