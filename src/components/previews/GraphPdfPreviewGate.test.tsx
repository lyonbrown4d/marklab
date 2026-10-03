import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GraphPdfPreviewGate } from '@/components/previews/GraphPdfPreviewGate'

vi.mock('@/components/previews/FilePreviewSurface', () => ({
  default: ({ path, src }: { path: string; src: string }) => (
    <div data-path={path} data-src={src} data-testid="pdf-preview" />
  ),
}))

describe('GraphPdfPreviewGate', () => {
  it('refreshes the asset capability before mounting the deferred PDF viewer', async () => {
    const refreshTarget = vi.fn(async () => ({
      external: false,
      kind: 'pdf' as const,
      path: 'docs/brief.pdf',
      readonly: false,
      src: 'marklab-asset://local/fresh-token',
    }))

    render(
      <GraphPdfPreviewGate
        label="Load PDF"
        path="docs/brief.pdf"
        readonly={false}
        refreshTarget={refreshTarget}
        src="marklab-asset://local/expired-token"
        title="Brief"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load PDF' }))

    await waitFor(() => expect(refreshTarget).toHaveBeenCalledOnce())
    expect(await screen.findByTestId('pdf-preview')).toHaveAttribute(
      'data-src',
      'marklab-asset://local/fresh-token',
    )
  })
})
