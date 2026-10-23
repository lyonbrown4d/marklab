import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import { fsApi } from '@/services/fsApi'

const resolveEmbeddedPreviewTarget = vi.hoisted(() => vi.fn())

vi.mock('@/components/previews/embeddedPreviewSource', () => ({
  embeddedPreviewKindForTarget: () => 'pdf',
  resolveEmbeddedPreviewTarget,
}))

vi.mock('@/components/previews/FilePreviewSurface', () => ({
  default: ({ presentation }: { presentation?: string }) => (
    <div data-presentation={presentation} data-testid="file-preview-surface" />
  ),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options?.path ? `${key}:${options.path}` : key,
  }),
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    openPathInSystem: vi.fn(),
  },
}))

type IntersectionObserverCallback = ConstructorParameters<typeof IntersectionObserver>[0]

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })

  return { promise, reject, resolve }
}

const renderPreview = () =>
  render(<EmbeddedFilePreview documentPath="notes/current.md" target="./brief.pdf" title="Brief" />)

describe('EmbeddedFilePreview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('defers resource resolution until the card becomes visible', async () => {
    let callback: IntersectionObserverCallback | null = null
    const observe = vi.fn()
    const disconnect = vi.fn()

    vi.stubGlobal(
      'IntersectionObserver',
      class MockIntersectionObserver {
        constructor(nextCallback: IntersectionObserverCallback) {
          callback = nextCallback
        }

        disconnect = disconnect
        observe = observe
        takeRecords = () => []
        root = null
        rootMargin = ''
        thresholds = []
        unobserve = vi.fn()
      },
    )
    resolveEmbeddedPreviewTarget.mockResolvedValue({
      external: false,
      kind: 'pdf',
      path: 'docs/brief.pdf',
      readonly: false,
      src: 'asset://docs/brief.pdf',
    })

    renderPreview()

    expect(screen.getByText('preview.inlinePending')).toBeInTheDocument()
    expect(resolveEmbeddedPreviewTarget).not.toHaveBeenCalled()

    act(() => {
      callback?.(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })

    await waitFor(() => {
      expect(resolveEmbeddedPreviewTarget).toHaveBeenCalledWith('notes/current.md', './brief.pdf')
    })
    expect(await screen.findByText('preview.inlineReady:docs/brief.pdf')).toBeInTheDocument()
    expect(disconnect).toHaveBeenCalled()
  })

  it('renders a resolved document preview directly in the body', async () => {
    resolveEmbeddedPreviewTarget.mockResolvedValue({
      external: false,
      kind: 'pdf',
      path: 'docs/brief.pdf',
      readonly: false,
      src: 'asset://docs/brief.pdf',
    })

    renderPreview()

    const surface = await screen.findByTestId('file-preview-surface')
    expect(surface).toHaveAttribute('data-presentation', 'embedded')
    expect(screen.getByText('preview.openInTab').closest('header')).toHaveAttribute(
      'data-slot',
      'embedded-preview-header',
    )
  })

  it('opens the embedded preview from the main card action', async () => {
    resolveEmbeddedPreviewTarget.mockResolvedValue({
      external: false,
      kind: 'pdf',
      path: 'docs/brief.pdf',
      readonly: false,
      src: 'asset://docs/brief.pdf',
    })

    renderPreview()

    fireEvent.click(screen.getByRole('button', { name: 'preview.openEmbedded: Brief' }))

    expect(resolveEmbeddedPreviewTarget).toHaveBeenCalledWith('notes/current.md', './brief.pdf')
    expect(await screen.findByTestId('file-preview-surface')).toBeInTheDocument()
  })

  it('announces modal loading once while the embedded target resolves', () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof resolveEmbeddedPreviewTarget>>>()
    resolveEmbeddedPreviewTarget.mockReturnValue(deferred.promise)

    renderPreview()

    fireEvent.click(screen.getByRole('button', { name: 'preview.openEmbedded: Brief' }))

    const status = screen.getByRole('status', { name: 'preview.inlineLoading' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('preview.inlineLoading')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
    expect(status.querySelector('[data-document-loading]')).toHaveAttribute('aria-hidden', 'true')
    expect(status.querySelectorAll('[data-splash-line]')).toHaveLength(3)
  })

  it('announces modal resolve failures as an alert', async () => {
    resolveEmbeddedPreviewTarget.mockRejectedValue(new Error('Unable to resolve embedded target'))

    renderPreview()

    fireEvent.click(screen.getByRole('button', { name: 'preview.openEmbedded: Brief' }))

    const alert = await screen.findByRole('alert', { name: 'preview.inlineFailed' })
    expect(alert).toHaveTextContent('preview.inlineFailed')
    expect(alert).toHaveClass('bg-destructive/10')
    expect(screen.queryByRole('status', { name: 'preview.inlineFailed' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'actions.retry' })).toBeEnabled()
  })

  it('opens the independent preview tab without router context', async () => {
    resolveEmbeddedPreviewTarget.mockResolvedValue({
      external: false,
      kind: 'pdf',
      path: 'docs/brief.pdf',
      readonly: false,
      src: 'asset://docs/brief.pdf',
    })
    window.location.hash = '#/'

    renderPreview()

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'preview.openEmbedded: Brief' }))
    const openInTab = await screen.findByText('preview.openInTab')
    fireEvent.click(openInTab.closest('button') ?? openInTab)

    expect(window.location.hash).toContain('/files/preview/')
    expect(window.location.hash).toContain('brief.pdf')
  })

  it('opens embedded source documents in an independent source tab', async () => {
    resolveEmbeddedPreviewTarget.mockResolvedValue({
      external: false,
      kind: 'source',
      path: 'src/example.ts',
      readonly: false,
      src: 'asset://src/example.ts',
    })
    window.location.hash = '#/'

    renderPreview()

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'preview.openEmbedded: Brief' }))
    const openInTab = await screen.findByText('preview.openInTab')
    fireEvent.click(openInTab.closest('button') ?? openInTab)

    expect(window.location.hash).toContain('/files/source/')
    expect(window.location.hash).toContain('example.ts')
  })

  it('retries a failed inline resolution and shows loading until it recovers', async () => {
    resolveEmbeddedPreviewTarget.mockRejectedValue(new Error('Temporary read failure'))
    renderPreview()
    await screen.findByRole('alert', { name: 'preview.inlineFailed' })
    const deferred = createDeferred<unknown>()
    resolveEmbeddedPreviewTarget.mockReturnValue(deferred.promise)

    fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }))

    expect(screen.queryByRole('button', { name: 'actions.retry' })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'preview.inlineLoading' })).toBeInTheDocument()
    await act(async () =>
      deferred.resolve({
        external: false,
        kind: 'pdf',
        path: 'docs/brief.pdf',
        readonly: false,
        src: 'asset://docs/brief.pdf',
      }),
    )
    expect(screen.getByTestId('file-preview-surface')).toBeInTheDocument()
    expect(screen.queryByRole('alert', { name: 'preview.inlineFailed' })).not.toBeInTheDocument()
  })

  it('reports system open failures and lets the user retry without duplicate opens', async () => {
    resolveEmbeddedPreviewTarget.mockResolvedValue({
      external: false,
      kind: 'pdf',
      path: 'docs/brief.pdf',
      readonly: false,
      src: 'asset://docs/brief.pdf',
    })
    const deferred = createDeferred<Awaited<ReturnType<typeof fsApi.openPathInSystem>>>()
    vi.mocked(fsApi.openPathInSystem).mockReturnValue(deferred.promise)
    renderPreview()
    await screen.findByTestId('file-preview-surface')
    const open = screen.getByRole('button', { name: 'preview.openInSystem' })
    fireEvent.click(open)
    fireEvent.click(open)
    expect(open).toBeDisabled()
    expect(fsApi.openPathInSystem).toHaveBeenCalledTimes(1)

    await act(async () => deferred.reject(new Error('No application can open this file')))

    expect(screen.getByRole('alert')).toHaveTextContent(
      'preview.openInSystem: context.actionFailed',
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No application can open this file')
    vi.mocked(fsApi.openPathInSystem).mockResolvedValue({ ok: true, path: 'docs/brief.pdf' })
    fireEvent.click(open)
    await waitFor(() => expect(open).toBeEnabled())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores a late retry response after switching the preview target', async () => {
    resolveEmbeddedPreviewTarget.mockRejectedValue(new Error('Temporary failure'))
    const { rerender } = renderPreview()
    await screen.findByRole('alert', { name: 'preview.inlineFailed' })
    const deferred = createDeferred<unknown>()
    resolveEmbeddedPreviewTarget.mockReturnValueOnce(deferred.promise)
    fireEvent.click(screen.getByRole('button', { name: 'actions.retry' }))
    resolveEmbeddedPreviewTarget.mockResolvedValue({
      external: false,
      kind: 'pdf',
      path: 'docs/new.pdf',
      readonly: false,
      src: 'asset://docs/new.pdf',
    })

    rerender(<EmbeddedFilePreview documentPath="notes/current.md" target="./new.pdf" title="New" />)
    await screen.findByText('preview.inlineReady:docs/new.pdf')
    await act(async () =>
      deferred.resolve({
        external: false,
        kind: 'pdf',
        path: 'docs/brief.pdf',
        readonly: false,
        src: 'asset://docs/brief.pdf',
      }),
    )

    expect(screen.getByText('preview.inlineReady:docs/new.pdf')).toBeInTheDocument()
    expect(screen.getByTestId('file-preview-surface')).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'preview.inlineLoading' })).not.toBeInTheDocument()
  })
})
