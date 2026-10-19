import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HtmlPreviewSurface from '@/components/previews/HtmlPreviewSurface'
import { htmlPreviewApi } from '@/services/htmlPreviewApi'

vi.mock('@/services/htmlPreviewApi', () => ({ htmlPreviewApi: { render: vi.fn() } }))
vi.mock('ahooks', async (original) => ({
  ...(await original<typeof import('ahooks')>()),
  useInViewport: () => [true],
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const show = (source: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <HtmlPreviewSurface source={source} title="page.html" presentation="embedded" />
    </QueryClientProvider>,
  )

describe('HTML document previews', () => {
  beforeEach(() => vi.mocked(htmlPreviewApi.render).mockReset())

  it('isolates native sanitized output in a frame with no script or origin privileges', async () => {
    vi.mocked(htmlPreviewApi.render).mockResolvedValue('<!doctype html><p>Native document</p>')
    show('<p>source</p>')
    const frame = await screen.findByTitle('preview.htmlLabel')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(frame).toHaveAttribute('srcdoc', '<!doctype html><p>Native document</p>')
    expect(frame).not.toHaveAttribute('src')
  })

  it('shows empty and failed states and can retry native preparation', async () => {
    const view = show('  ')
    expect(screen.getByText('preview.sourceEmpty')).toBeInTheDocument()
    expect(htmlPreviewApi.render).not.toHaveBeenCalled()
    view.unmount()
    vi.mocked(htmlPreviewApi.render)
      .mockRejectedValueOnce(new Error('Native failure'))
      .mockResolvedValueOnce('<p>Recovered</p>')
    show('<p>Retry me</p>')
    expect(await screen.findByRole('alert')).toHaveTextContent('preview.htmlFailed')
    fireEvent.click(screen.getByRole('button', { name: 'preview.spreadsheetRetry' }))
    await waitFor(() =>
      expect(screen.getByTitle('preview.htmlLabel')).toHaveAttribute('srcdoc', '<p>Recovered</p>'),
    )
  })
})
