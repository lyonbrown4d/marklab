import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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

const renderPreview = ({ onPointerDown }: { onPointerDown?: () => void } = {}) =>
  render(
    <MemoryRouter>
      <div onPointerDown={onPointerDown}>
        <EmbeddedFilePreview documentPath="notes/current.md" target="./brief.pdf" title="Brief" />
      </div>
    </MemoryRouter>,
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
