import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DocxPreviewSurface from '@/components/previews/DocxPreviewSurface'
import { fetchPreviewAssetBlob } from '@/components/previews/localAssetSource'

const renderDocx = vi.hoisted(() => vi.fn())

vi.mock('docx-preview', () => ({ renderAsync: renderDocx }))

vi.mock('@/components/previews/localAssetSource', () => ({
  fetchPreviewAssetBlob: vi.fn(),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'preview.docxFailed': 'Unable to preview Word document',
        'preview.docxLabel': `${values?.name ?? 'Document'} preview`,
        'preview.docxLoading': 'Rendering Word document...',
      }
      return labels[key] ?? key
    },
  }),
}))

describe('DocxPreviewSurface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renderDocx.mockResolvedValue(undefined)
    vi.mocked(fetchPreviewAssetBlob).mockReturnValue(new Promise(() => undefined))
  })

  it('uses the shared loading fallback while rendering the document', () => {
    render(<DocxPreviewSurface src="file:///report.docx" title="report.docx" />)

    const status = screen.getByRole('status', { name: 'Rendering Word document...' })

    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Rendering Word document...')
    expect(status.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('status', { name: 'Loading' })).not.toBeInTheDocument()
  })

  it('uses an alert when the document render fails', async () => {
    vi.mocked(fetchPreviewAssetBlob).mockRejectedValue(new Error('corrupt docx'))

    render(<DocxPreviewSurface src="file:///broken.docx" title="broken.docx" />)

    const alert = await screen.findByRole('alert')

    expect(alert).toHaveTextContent('Unable to preview Word document')
    expect(alert).toHaveTextContent('corrupt docx')
    expect(alert).toHaveClass('bg-destructive/10')
  })

  it('aborts pending asset reads when the source changes or the preview unmounts', async () => {
    const signals: AbortSignal[] = []
    vi.mocked(fetchPreviewAssetBlob).mockImplementation((_src, _mediaType, signal) => {
      if (!signal) throw new Error('Expected an abort signal')
      signals.push(signal)
      return new Promise(() => undefined)
    })

    const { rerender, unmount } = render(
      <DocxPreviewSurface src="file:///first.docx" title="first.docx" />,
    )

    await waitFor(() => expect(fetchPreviewAssetBlob).toHaveBeenCalledOnce())
    expect(signals).toHaveLength(1)
    expect(signals[0]?.aborted).toBe(false)

    rerender(<DocxPreviewSurface src="file:///second.docx" title="second.docx" />)

    await waitFor(() => expect(fetchPreviewAssetBlob).toHaveBeenCalledTimes(2))
    expect(signals).toHaveLength(2)
    expect(signals[0]?.aborted).toBe(true)
    expect(signals[1]?.aborted).toBe(false)

    unmount()

    expect(signals[1]?.aborted).toBe(true)
  })

  it('does not let an older render write into the next document surface', async () => {
    let finishFirstRender: (() => void) | undefined
    renderDocx
      .mockImplementationOnce(
        (_data: ArrayBuffer, body: HTMLElement) =>
          new Promise<void>((resolve) => {
            finishFirstRender = () => {
              body.textContent = 'first document'
              resolve()
            }
          }),
      )
      .mockImplementationOnce(async (_data: ArrayBuffer, body: HTMLElement) => {
        body.textContent = 'second document'
      })
    vi.mocked(fetchPreviewAssetBlob).mockResolvedValue(new Blob(['document']))

    const { rerender } = render(<DocxPreviewSurface src="file:///first.docx" title="first.docx" />)
    await waitFor(() => expect(renderDocx).toHaveBeenCalledOnce())

    rerender(<DocxPreviewSurface src="file:///second.docx" title="second.docx" />)
    const surface = screen.getByLabelText('second.docx preview')
    await waitFor(() => expect(surface).toHaveTextContent('second document'))

    await act(async () => finishFirstRender?.())

    expect(surface).toHaveTextContent('second document')
    expect(surface).not.toHaveTextContent('first document')
  })
})
