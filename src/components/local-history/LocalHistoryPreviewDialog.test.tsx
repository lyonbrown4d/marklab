import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LocalHistoryPreviewDialog from '@/components/local-history/LocalHistoryPreviewDialog'
import { configureMonaco } from '@/lib/monaco'
import { fsApi } from '@/services/fsApi'
import { localHistoryApi, type LocalHistoryEntry } from '@/services/localHistoryApi'

vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => false }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/lib/monaco', () => ({ configureMonaco: vi.fn() }))
vi.mock('@/services/fsApi', () => ({ fsApi: { readFile: vi.fn() } }))
vi.mock('@/services/localHistoryApi', () => ({ localHistoryApi: { read: vi.fn() } }))
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: ({ original, modified }: { original: string; modified: string }) => (
    <div data-testid="history-diff">
      {original} → {modified}
    </div>
  ),
}))

const entry: LocalHistoryEntry = {
  id: 'snapshot-1',
  path: 'notes.md',
  created_at: '2026-10-14T00:00:00Z',
  size_bytes: 5,
  content_hash: 'a'.repeat(64),
  source: 'save',
}

const renderDialog = () => {
  const onDelete = vi.fn()
  const onRestore = vi.fn()
  const onOpenChange = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return {
    ...render(
      <QueryClientProvider client={client}>
        <LocalHistoryPreviewDialog
          entry={entry}
          open
          path="notes.md"
          onDelete={onDelete}
          onRestore={onRestore}
          onOpenChange={onOpenChange}
        />
      </QueryClientProvider>,
    ),
    onDelete,
    onRestore,
    onOpenChange,
    client,
  }
}

describe('LocalHistoryPreviewDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(configureMonaco).mockResolvedValue({} as Awaited<ReturnType<typeof configureMonaco>>)
    vi.mocked(localHistoryApi.read).mockResolvedValue({ ...entry, content: 'Saved' })
    vi.mocked(fsApi.readFile).mockResolvedValue('Current')
  })

  it('announces document loading once and preserves closing the dialog', () => {
    vi.mocked(localHistoryApi.read).mockReturnValue(new Promise(() => {}))
    const { onOpenChange } = renderDialog()
    const status = screen.getByRole('status', { name: 'localHistory.loading' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    expect(status.querySelector('[data-document-loading]')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getAllByRole('status')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the document loading state until Monaco configuration completes', async () => {
    vi.mocked(configureMonaco).mockReturnValue(new Promise(() => {}))
    const { client } = renderDialog()
    await waitFor(() => expect(client.isFetching()).toBe(0))
    const status = await screen.findByRole('status', { name: 'localHistory.loading' })
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status.querySelectorAll('[data-splash-line]')).toHaveLength(3)
    expect(screen.queryByTestId('history-diff')).not.toBeInTheDocument()
  })

  it('clears loading when snapshot reading fails', async () => {
    vi.mocked(localHistoryApi.read).mockRejectedValue(new Error('Snapshot unavailable'))
    renderDialog()
    expect(await screen.findByRole('alert')).toHaveTextContent('Snapshot unavailable')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('renders saved and current content and preserves restore and delete actions', async () => {
    const { onDelete, onRestore } = renderDialog()
    expect(await screen.findByTestId('history-diff')).toHaveTextContent('Saved → Current')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'localHistory.restore' }))
    fireEvent.click(screen.getByRole('button', { name: 'localHistory.delete' }))
    expect(onRestore).toHaveBeenCalledWith(entry)
    expect(onDelete).toHaveBeenCalledWith(entry)
  })
})
