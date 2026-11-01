import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'

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

const renderPreview = ({
  onPointerDown,
}: {
  onPointerDown?: () => void
} = {}) =>
  render(
    <div onPointerDown={onPointerDown}>
      <EmbeddedFilePreview documentPath="notes/current.md" target="./brief.pdf" title="Brief" />
    </div>,
  )

describe('EmbeddedFilePreview interactions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
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
