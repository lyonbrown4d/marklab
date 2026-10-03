import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SourcePreviewSurface, {
  GRAPH_SOURCE_PREVIEW_BYTES,
  GRAPH_SOURCE_PREVIEW_CHARACTERS,
  GRAPH_SOURCE_PREVIEW_LINES,
  MAX_SOURCE_PREVIEW_BYTES,
  MAX_SOURCE_PREVIEW_CHARACTERS,
  MAX_SOURCE_PREVIEW_LINES,
} from '@/components/previews/SourcePreviewSurface'
import { writeClipboardText } from '@/runtime/clipboard'
import { fsApi } from '@/services/fsApi'

vi.mock('@/runtime/clipboard', () => ({
  writeClipboardText: vi.fn<() => Promise<void>>(),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      ({
        'preview.sourceComplete': 'Complete preview',
        'preview.sourceCopied': 'Copied source',
        'preview.sourceCopy': 'Copy source',
        'preview.sourceCopyPreview': 'Copy preview',
        'preview.sourceCopyFailed': 'Copy source failed',
        'preview.sourceEmpty': 'This source file is empty.',
        'preview.sourceFailed': 'Source preview failed',
        'preview.sourceLoading': 'Loading source preview',
        'preview.sourceReadFailed': 'Unable to preview source file',
        'preview.sourceTooLarge': 'Source file is too large to preview',
        'preview.sourceTruncated': 'Preview truncated',
        'preview.sourceLabel': `${String(options?.title)} source preview`,
        'preview.sourceLines': 'Source lines',
      })[key] ?? key,
  }),
}))

vi.mock('@/services/fsApi', () => ({
  fsApi: {
    readTextPreview: vi.fn(),
  },
}))

const renderPreview = (
  path = 'src/example.ts',
  onChromeEvent?: () => void,
  presentation?: 'embedded' | 'full' | 'graph',
) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <div onClick={onChromeEvent} onPointerDown={onChromeEvent}>
        <SourcePreviewSurface path={path} presentation={presentation} title="example.ts" />
      </div>
    </QueryClientProvider>,
  )
}

describe('SourcePreviewSurface', () => {
  beforeEach(() => {
    vi.mocked(fsApi.readTextPreview).mockReset()
    vi.mocked(writeClipboardText).mockReset()
    vi.mocked(writeClipboardText).mockResolvedValue(undefined)
  })

  it('loads one bounded preview and renders numbered copyable source', async () => {
    vi.mocked(fsApi.readTextPreview).mockResolvedValue({
      content: 'const value = 1\nconsole.log(value)',
      truncated: false,
    })

    const parentEvent = vi.fn()
    renderPreview('src/example.ts', parentEvent)

    expect(screen.getByRole('status', { name: 'Loading source preview' })).toBeInTheDocument()
    expect(await screen.findByText('TypeScript')).toBeInTheDocument()
    expect(screen.getByText('const value = 1')).toBeInTheDocument()
    expect(screen.getByText('console.log(value)')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(fsApi.readTextPreview).toHaveBeenCalledWith('src/example.ts', MAX_SOURCE_PREVIEW_BYTES)

    const copyButton = screen.getByRole('button', { name: 'Copy source' })
    fireEvent.pointerDown(copyButton)
    fireEvent.click(copyButton)

    await waitFor(() => {
      expect(writeClipboardText).toHaveBeenCalledWith('const value = 1\nconsole.log(value)')
    })
    expect(parentEvent).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copied source' })).toBeInTheDocument()
  })

  it('reports read failures', async () => {
    vi.mocked(fsApi.readTextPreview).mockRejectedValue(new Error('unreadable'))

    renderPreview()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to preview source file')
  })

  it('shows empty source files explicitly', async () => {
    vi.mocked(fsApi.readTextPreview).mockResolvedValue({ content: '', truncated: false })

    renderPreview()

    expect(await screen.findByText('This source file is empty.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy source' })).toBeDisabled()
  })

  it('marks the display as truncated while copying the complete loaded content', async () => {
    const lines = Array.from(
      { length: MAX_SOURCE_PREVIEW_LINES + 1 },
      (_, index) => `line ${index}`,
    )
    const content = `${lines.join('\n')}${'x'.repeat(MAX_SOURCE_PREVIEW_CHARACTERS)}`
    vi.mocked(fsApi.readTextPreview).mockResolvedValue({ content, truncated: true })

    renderPreview()

    expect(await screen.findByText('Preview truncated')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(MAX_SOURCE_PREVIEW_LINES)
    fireEvent.click(screen.getByRole('button', { name: 'Copy preview' }))
    await waitFor(() => expect(writeClipboardText).toHaveBeenCalledWith(content))
  })

  it('announces clipboard failures without throwing', async () => {
    vi.mocked(fsApi.readTextPreview).mockResolvedValue({
      content: 'let value = 1',
      truncated: false,
    })
    vi.mocked(writeClipboardText).mockRejectedValue(new Error('clipboard unavailable'))

    renderPreview()

    fireEvent.click(await screen.findByRole('button', { name: 'Copy source' }))

    expect(await screen.findByRole('button', { name: 'Copy source failed' })).toBeInTheDocument()
  })

  it('fits the graph node height instead of enforcing the document minimum', async () => {
    vi.mocked(fsApi.readTextPreview).mockResolvedValue({
      content: 'const value = 1',
      truncated: false,
    })

    renderPreview('src/example.ts', undefined, 'graph')

    const preview = await screen.findByRole('article', { name: 'example.ts source preview' })
    expect(preview).toHaveClass('h-full', 'min-h-0')
    expect(preview).not.toHaveClass('min-h-[20rem]')
    expect(fsApi.readTextPreview).toHaveBeenCalledWith('src/example.ts', GRAPH_SOURCE_PREVIEW_BYTES)
  })

  it('bounds graph rendering independently from the main-process byte limit', async () => {
    const lines = Array.from(
      { length: GRAPH_SOURCE_PREVIEW_LINES + 5 },
      (_, index) => `${index}:${'x'.repeat(180)}`,
    )
    vi.mocked(fsApi.readTextPreview).mockResolvedValue({
      content: lines.join('\n'),
      truncated: true,
    })

    renderPreview('src/example.ts', undefined, 'graph')

    expect(await screen.findByText('Preview truncated')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(GRAPH_SOURCE_PREVIEW_LINES)
    const rendered = screen.getByRole('list', { name: 'Source lines' }).textContent ?? ''
    expect(rendered.length).toBeLessThanOrEqual(GRAPH_SOURCE_PREVIEW_CHARACTERS + 200)
  })
})
