import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isCommandPaletteBlockedByActiveSurface,
  useNativeSurfaceOcclusionStore,
} from '@/app/nativeSurfaceOcclusion'
import LocalHistoryTimeline from '@/components/local-history/LocalHistoryTimeline'
import { fsApi } from '@/services/fsApi'
import { localHistoryApi } from '@/services/localHistoryApi'
import { prewarmPlateMarkdown } from '@/services/plateMarkdownWorkerClient'

const diffEditorMock = vi.hoisted(() => {
  const original = { dispose: vi.fn() }
  const modified = { dispose: vi.fn() }
  return {
    editor: {
      getModel: vi.fn(() => ({ modified, original })),
      setModel: vi.fn(),
    },
    modified,
    original,
  }
})

vi.mock('@monaco-editor/react', () => ({
  DiffEditor: ({
    modified,
    onMount,
    original,
  }: {
    modified: string
    onMount?: (editor: typeof diffEditorMock.editor, monaco: object) => void
    original: string
  }) => {
    useEffect(() => onMount?.(diffEditorMock.editor, {}), [onMount])
    return (
      <div data-testid="history-diff">
        <span>{original}</span>
        <span>{modified}</span>
      </div>
    )
  },
}))

vi.mock('@/lib/monaco', () => ({ configureMonaco: vi.fn(() => Promise.resolve()) }))

vi.mock('@/services/fsApi', () => ({ fsApi: { readFile: vi.fn() } }))

vi.mock('@/services/localHistoryApi', () => ({
  localHistoryApi: {
    list: vi.fn(),
    read: vi.fn(),
    restore: vi.fn(),
    delete: vi.fn(),
    clear: vi.fn(),
  },
}))

vi.mock('@/services/plateMarkdownWorkerClient', () => ({
  prewarmPlateMarkdown: vi.fn(),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (key: string, options?: Record<string, string>) => {
      const labels: Record<string, string> = {
        'localHistory.title': 'Timeline',
        'localHistory.empty': 'No local history yet',
        'localHistory.loadFailed': 'Could not load local history',
        'localHistory.clear': 'Clear timeline',
        'localHistory.preview': `Preview version ${options?.date ?? ''}`,
        'localHistory.previewTitle': 'Local history preview',
        'localHistory.previewDescription': 'Compare this saved version with the current file.',
        'localHistory.current': 'Current',
        'localHistory.savedVersion': 'Saved version',
        'localHistory.restore': 'Restore',
        'localHistory.delete': 'Delete',
        'localHistory.cancel': 'Cancel',
        'localHistory.restoreConfirmTitle': 'Restore this version?',
        'localHistory.restoreConfirmDescription': 'The current file will be replaced.',
        'localHistory.deleteConfirmTitle': 'Delete this version?',
        'localHistory.deleteConfirmDescription': 'This cannot be undone.',
        'localHistory.clearConfirmTitle': 'Clear local history?',
        'localHistory.clearConfirmDescription': 'All saved versions will be removed.',
        'localHistory.previewFailed': 'Could not load this version',
        'localHistory.loading': 'Loading local history',
        'localHistory.size': `${options?.size ?? '0'} bytes`,
      }
      return labels[key] ?? key
    },
  }),
}))

const entry = {
  id: 'snapshot-1',
  path: 'README.md',
  created_at: '2026-09-30T08:00:00.000Z',
  size_bytes: 14,
  content_hash: 'a'.repeat(64),
  source: 'save' as const,
}

const renderTimeline = (onRestoreContent = vi.fn()) =>
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LocalHistoryTimeline path="README.md" onRestoreContent={onRestoreContent} />
    </QueryClientProvider>,
  )

describe('LocalHistoryTimeline', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useNativeSurfaceOcclusionStore.setState({ reasons: {}, commandPaletteBlockers: {} })
    vi.mocked(localHistoryApi.list).mockResolvedValue([entry])
    vi.mocked(localHistoryApi.read).mockResolvedValue({ ...entry, content: '# Earlier' })
    vi.mocked(localHistoryApi.restore).mockResolvedValue({ ...entry, content: '# Earlier' })
    vi.mocked(localHistoryApi.delete).mockResolvedValue()
    vi.mocked(localHistoryApi.clear).mockResolvedValue(1)
    vi.mocked(fsApi.readFile).mockResolvedValue('# Current')
    vi.mocked(prewarmPlateMarkdown).mockResolvedValue()
  })

  it('previews a saved version and restores it after confirmation', async () => {
    const onRestoreContent = vi.fn()
    renderTimeline(onRestoreContent)

    const previewButton = await screen.findByRole('button', { name: /Preview version/ })
    expect(localHistoryApi.read).not.toHaveBeenCalled()
    expect(fsApi.readFile).not.toHaveBeenCalled()

    fireEvent.click(previewButton)
    expect(await screen.findByTestId('history-diff')).toHaveTextContent('# Earlier')
    expect(screen.getByTestId('history-diff')).toHaveTextContent('# Current')
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Restore' }))

    await waitFor(() =>
      expect(localHistoryApi.restore).toHaveBeenCalledWith('README.md', 'snapshot-1'),
    )
    await waitFor(() => expect(onRestoreContent).toHaveBeenCalledWith('# Earlier'))
    expect(prewarmPlateMarkdown).toHaveBeenCalledWith('# Earlier')
    await waitFor(() => expect(diffEditorMock.editor.setModel).toHaveBeenCalledWith(null))
    expect(diffEditorMock.original.dispose).toHaveBeenCalledOnce()
    expect(diffEditorMock.modified.dispose).toHaveBeenCalledOnce()
  })

  it('continues applying a restored version when cache prewarming fails', async () => {
    const onRestoreContent = vi.fn()
    vi.mocked(prewarmPlateMarkdown).mockRejectedValue(new Error('Worker unavailable'))
    renderTimeline(onRestoreContent)

    fireEvent.click(await screen.findByRole('button', { name: /Preview version/ }))
    await screen.findByTestId('history-diff')
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Restore' }),
    )

    await waitFor(() => expect(onRestoreContent).toHaveBeenCalledWith('# Earlier'))
  })

  it('clears all versions only after confirmation', async () => {
    renderTimeline()

    await screen.findByRole('button', { name: /Preview version/ })
    fireEvent.click(screen.getByRole('button', { name: 'Clear timeline' }))
    const confirmation = await screen.findByRole('alertdialog')
    expect(isCommandPaletteBlockedByActiveSurface()).toBe(true)
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Clear timeline' }))

    await waitFor(() => expect(localHistoryApi.clear).toHaveBeenCalledWith('README.md'))
    await waitFor(() => expect(isCommandPaletteBlockedByActiveSurface()).toBe(false))
  })

  it('deletes one selected version only after confirmation', async () => {
    renderTimeline()

    fireEvent.click(await screen.findByRole('button', { name: /Preview version/ }))
    await screen.findByTestId('history-diff')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    const confirmation = await screen.findByRole('alertdialog')
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Delete' }))

    await waitFor(() =>
      expect(localHistoryApi.delete).toHaveBeenCalledWith('README.md', 'snapshot-1'),
    )
  })
})
