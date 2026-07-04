import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import type { PreviewFileKind } from '@/logic/fileTypes'

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'preview.unsupportedTitle': 'Preview unavailable',
      })[key] ?? key,
  }),
}))

describe('FilePreviewSurface', () => {
  it('uses a shared empty state for unsupported preview kinds', () => {
    const unsupportedKind = 'unsupported' as PreviewFileKind

    const { container } = render(
      <FilePreviewSurface
        kind={unsupportedKind}
        path="notes/archive.bin"
        src="asset://notes/archive.bin"
        title="archive.bin"
      />,
    )

    const emptyState = screen.getByRole('note')

    expect(emptyState).toHaveAttribute('data-slot', 'empty')
    expect(screen.getByRole('heading', { name: 'Preview unavailable' })).toHaveAttribute(
      'aria-level',
      '3',
    )
    expect(container.querySelector('[data-slot="empty-icon"]')).toBeInTheDocument()
  })
})
