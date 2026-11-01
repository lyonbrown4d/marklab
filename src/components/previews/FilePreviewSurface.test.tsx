import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FilePreviewSurface from '@/components/previews/FilePreviewSurface'
import type { PreviewFileKind } from '@/logic/fileTypes'

vi.mock('@/components/previews/SourcePreviewSurface', () => ({
  default: ({ path, title }: { path: string; title: string }) => (
    <div data-path={path} data-testid="source-preview-surface">
      {title}
    </div>
  ),
}))

vi.mock('@/components/previews/SpreadsheetPreviewSurface', () => ({
  default: ({ path, src }: { path: string; src?: string }) => (
    <div data-testid="spreadsheet-preview" data-path={path} data-source={src} />
  ),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'preview.unsupportedTitle': 'Preview unavailable',
      })[key] ?? key,
  }),
}))

describe('FilePreviewSurface', () => {
  it('routes Excel snapshots through the native spreadsheet preview', async () => {
    const props = {
      kind: 'spreadsheet' as const,
      path: 'report.xlsx',
      src: 'marklab-asset://local/v1/snapshot',
      title: 'report.xlsx',
    }
    render(<FilePreviewSurface {...props} snapshot />)
    const table = await screen.findByTestId('spreadsheet-preview')
    expect(table).toHaveAttribute('data-path', 'report.xlsx')
    expect(table).toHaveAttribute('data-source', props.src)
  })
  it('routes source resources through the bounded source preview', async () => {
    render(
      <FilePreviewSurface
        kind="source"
        path="src/example.ts"
        src="asset://src/example.ts"
        title="example.ts"
      />,
    )

    const preview = await screen.findByTestId('source-preview-surface')
    expect(preview).toHaveAttribute('data-path', 'src/example.ts')
    expect(preview).toHaveTextContent('example.ts')
  })

  it('uses real native image content for previews', () => {
    render(
      <FilePreviewSurface
        kind="image"
        path="images/cover.png"
        src="asset://images/cover.png"
        title="cover.png"
      />,
    )

    expect(screen.getByRole('img')).toHaveAttribute('src', 'asset://images/cover.png')
  })

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
