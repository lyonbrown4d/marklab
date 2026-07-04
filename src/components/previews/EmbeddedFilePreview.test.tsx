import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'

const resolveEmbeddedPreviewTarget = vi.hoisted(() => vi.fn())

vi.mock('@/components/previews/embeddedPreviewSource', () => ({
  embeddedPreviewKindForTarget: () => 'pdf',
  resolveEmbeddedPreviewTarget,
}))

vi.mock('@/components/previews/FilePreviewSurface', () => ({
  default: () => <div data-testid="file-preview-surface" />,
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

const renderPreview = ({ onPointerDown }: { onPointerDown?: () => void } = {}) =>
  render(
    <div onPointerDown={onPointerDown}>
      <EmbeddedFilePreview documentPath="notes/current.md" target="./brief.pdf" title="Brief" />
    </div>,
  )

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
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('announces modal resolve failures as an alert', async () => {
    resolveEmbeddedPreviewTarget.mockRejectedValue(new Error('Unable to resolve embedded target'))

    renderPreview()

    fireEvent.click(screen.getByRole('button', { name: 'preview.openEmbedded: Brief' }))

    const alert = await screen.findByRole('alert', { name: 'preview.inlineFailed' })
    expect(alert).toHaveTextContent('preview.inlineFailed')
    expect(alert).toHaveClass('bg-destructive/10')
    expect(screen.queryByRole('status', { name: 'preview.inlineFailed' })).not.toBeInTheDocument()
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

  it('keeps pointer interaction inside the preview widget boundary', () => {
    const parentPointerDown = vi.fn()

    renderPreview({ onPointerDown: parentPointerDown })

    const card = screen
      .getByText('Brief')
      .closest<HTMLElement>('[data-marklab-editor-chrome="embedded-preview"]')
    if (!card) throw new Error('Expected embedded preview card')

    fireEvent.pointerDown(card)

    expect(parentPointerDown).not.toHaveBeenCalled()
  })
})
