import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceSyncConflictsDialog } from '@/features/workspace-sync/WorkspaceSyncConflictsDialog'
import { workspaceSyncApi } from '@/services/workspaceSyncApi'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import type { WorkspaceSyncConflictComparison } from '@/types/workspaceSync'

vi.mock('@/services/workspaceSyncApi', () => ({
  workspaceSyncApi: {
    listConflicts: vi.fn(),
    readConflict: vi.fn(),
    resolveConflict: vi.fn(),
  },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/app/nativeSurfaceOcclusion', () => ({ useNativeSurfaceOcclusion: vi.fn() }))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn() }))

const binding = { profileId: 'cloud', remoteRoot: '/documents' }
const conflict = {
  path: 'note.md',
  status: 'unresolved' as const,
  reason: 'both_changed' as const,
  conflictPath: 'note.conflict.md',
}
const comparison: WorkspaceSyncConflictComparison = {
  conflict,
  local: { hash: 'a'.repeat(64), size: 5, text: 'local content', unavailable: null },
  savedRemote: { hash: 'b'.repeat(64), size: 6, text: 'remote content', unavailable: null },
}
const createView = (rootPath = '/one') => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const props = { rootPath, open: true, onOpenChange: vi.fn() }
  const view = render(
    <QueryClientProvider client={client}>
      <WorkspaceSyncConflictsDialog {...props} />
    </QueryClientProvider>,
  )
  return {
    ...view,
    client,
    props,
    rerenderRoot: (path: string) =>
      view.rerender(
        <QueryClientProvider client={client}>
          <WorkspaceSyncConflictsDialog {...props} rootPath={path} />
        </QueryClientProvider>,
      ),
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(flushEditorChanges).mockResolvedValue(undefined)
  vi.mocked(workspaceSyncApi.listConflicts).mockResolvedValue({ conflicts: [conflict], binding })
  vi.mocked(workspaceSyncApi.readConflict).mockResolvedValue(comparison)
  vi.mocked(workspaceSyncApi.resolveConflict).mockResolvedValue({ ok: true })
})

describe('WorkspaceSyncConflictsDialog', () => {
  it('does not read conflict versions when pending editor changes cannot be saved', async () => {
    vi.mocked(flushEditorChanges).mockRejectedValueOnce(new Error('Pending save failed'))
    createView()
    expect(await screen.findByRole('alert')).toHaveTextContent('Pending save failed')
    expect(workspaceSyncApi.readConflict).not.toHaveBeenCalled()
    expect(workspaceSyncApi.resolveConflict).not.toHaveBeenCalled()
  })

  it('does not replace a document if the latest editor changes fail to flush', async () => {
    createView()
    await screen.findByText('local content')
    expect(flushEditorChanges).toHaveBeenCalled()
    vi.mocked(flushEditorChanges).mockRejectedValueOnce(new Error('Latest save failed'))
    await userEvent.click(screen.getByRole('button', { name: 'sync.conflicts.useRemote' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Latest save failed')
    expect(workspaceSyncApi.resolveConflict).not.toHaveBeenCalled()
  })

  it('lists persisted conflict reasons and compares current local with saved remote', async () => {
    createView()
    expect(await screen.findByText('local content')).toBeInTheDocument()
    expect(screen.getByText('remote content')).toBeInTheDocument()
    expect(screen.getByText('sync.conflicts.reason.both_changed')).toBeInTheDocument()
    expect(workspaceSyncApi.readConflict).toHaveBeenCalledWith({
      rootPath: '/one',
      path: 'note.md',
      binding,
    })
  })

  it('resolves a reviewed local version and refreshes durable listing', async () => {
    createView()
    await screen.findByText('local content')
    vi.mocked(workspaceSyncApi.listConflicts).mockResolvedValue({ conflicts: [], binding })
    await userEvent.click(screen.getByRole('button', { name: 'sync.conflicts.useLocal' }))
    await waitFor(() =>
      expect(workspaceSyncApi.resolveConflict).toHaveBeenCalledWith({
        rootPath: '/one',
        path: 'note.md',
        binding,
        choice: 'local',
        confirmDelete: false,
        expectedLocalHash: comparison.local.hash,
        expectedRemoteHash: comparison.savedRemote.hash,
      }),
    )
    expect(await screen.findByText('sync.conflicts.none')).toBeInTheDocument()
  })

  it('requires explicit deletion confirmation and guards duplicate submit', async () => {
    vi.mocked(workspaceSyncApi.readConflict).mockResolvedValue({
      ...comparison,
      savedRemote: { hash: null, size: 0, text: null, unavailable: 'deleted' },
    })
    vi.mocked(workspaceSyncApi.resolveConflict).mockImplementation(
      () => new Promise(() => undefined),
    )
    createView()
    await screen.findByText('local content')
    const remoteChoice = screen.getByRole('button', { name: 'sync.conflicts.useRemote' })
    expect(remoteChoice).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.dblClick(remoteChoice)
    await waitFor(() => expect(workspaceSyncApi.resolveConflict).toHaveBeenCalledOnce())
    expect(workspaceSyncApi.resolveConflict).toHaveBeenCalledWith(
      expect.objectContaining({ choice: 'remote', confirmDelete: true }),
    )
    expect(remoteChoice).toBeDisabled()
  })

  it('reports failed decisions without removing the conflict', async () => {
    vi.mocked(workspaceSyncApi.resolveConflict).mockRejectedValue(
      new Error('Remote version changed'),
    )
    createView()
    await screen.findByText('local content')
    await userEvent.click(screen.getByRole('button', { name: 'sync.conflicts.useLocal' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Remote version changed')
    expect(screen.getByText('sync.conflicts.reason.both_changed')).toBeInTheDocument()
  })

  it('reports failed comparisons and cannot resolve stale data after refetch fails', async () => {
    const { client } = createView()
    await screen.findByText('local content')
    vi.mocked(workspaceSyncApi.readConflict).mockRejectedValue(
      new Error('Conflict version changed'),
    )
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['workspace-sync', 'comparison'] })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflict version changed')
    expect(screen.getByRole('button', { name: 'sync.conflicts.useLocal' })).toBeDisabled()
    expect(workspaceSyncApi.resolveConflict).not.toHaveBeenCalled()
  })

  it('clears previous snapshots and delete confirmation on a workspace switch', async () => {
    vi.mocked(workspaceSyncApi.readConflict).mockImplementation(async ({ rootPath }) =>
      rootPath === '/one'
        ? {
            ...comparison,
            savedRemote: { hash: null, size: 0, text: null, unavailable: 'deleted' },
          }
        : { ...comparison, local: { ...comparison.local, text: 'second workspace' } },
    )
    const view = createView()
    await screen.findByText('local content')
    await userEvent.click(screen.getByRole('checkbox'))
    view.rerenderRoot('/two')
    expect(screen.queryByText('local content')).not.toBeInTheDocument()
    expect(await screen.findByText('second workspace')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'sync.conflicts.useLocal' }))
    await waitFor(() =>
      expect(workspaceSyncApi.resolveConflict).toHaveBeenCalledWith(
        expect.objectContaining({ rootPath: '/two', confirmDelete: false }),
      ),
    )
  })

  it('does not transfer deletion consent when refresh removes the selected conflict', async () => {
    const second = { ...conflict, path: 'second.md' }
    vi.mocked(workspaceSyncApi.readConflict).mockImplementation(async ({ path }) => ({
      ...comparison,
      conflict: { ...conflict, path },
      savedRemote: { hash: null, size: 0, text: null, unavailable: 'deleted' },
    }))
    const { client } = createView()
    await screen.findByText('local content')
    await userEvent.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: 'sync.conflicts.useRemote' })).toBeEnabled()
    vi.mocked(workspaceSyncApi.listConflicts).mockResolvedValue({ conflicts: [second], binding })
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['workspace-sync', 'conflicts'] })
    })
    await waitFor(() =>
      expect(workspaceSyncApi.readConflict).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'second.md' }),
      ),
    )
    await waitFor(() => expect(screen.getByRole('checkbox')).not.toBeChecked())
    expect(screen.getByRole('button', { name: 'sync.conflicts.useRemote' })).toBeDisabled()
    expect(workspaceSyncApi.resolveConflict).not.toHaveBeenCalled()
  })

  it('shows loading, failed listing and empty states explicitly', async () => {
    vi.mocked(workspaceSyncApi.listConflicts).mockRejectedValue(new Error('listing unavailable'))
    createView()
    expect(screen.getByRole('status')).toHaveTextContent('sync.center.loading')
    expect(await screen.findByRole('alert')).toHaveTextContent('listing unavailable')
    expect(workspaceSyncApi.readConflict).not.toHaveBeenCalled()
  })
  it.each(['binary', 'too_large', 'deleted'] as const)(
    'explains %s versions without rendering misleading text',
    async (unavailable) => {
      vi.mocked(workspaceSyncApi.readConflict).mockResolvedValue({
        ...comparison,
        local: {
          hash: unavailable === 'deleted' ? null : comparison.local.hash,
          size: 100,
          text: null,
          unavailable,
        },
        savedRemote: { ...comparison.savedRemote, text: '' },
      })
      createView()
      expect(await screen.findByText(`sync.conflicts.${unavailable}`)).toBeInTheDocument()
      expect(screen.getByText('sync.conflicts.emptyFile')).toBeInTheDocument()
      expect(screen.queryByText('local content')).not.toBeInTheDocument()
      if (unavailable === 'deleted')
        expect(screen.getByRole('button', { name: 'sync.conflicts.useLocal' })).toBeDisabled()
    },
  )

  it('refreshes a failed comparison and resolves an edited local merge using its current hash', async () => {
    vi.mocked(workspaceSyncApi.readConflict).mockRejectedValueOnce(new Error('version changed'))
    createView()
    expect(await screen.findByRole('alert')).toHaveTextContent('version changed')
    vi.mocked(workspaceSyncApi.readConflict).mockResolvedValue({
      ...comparison,
      local: { ...comparison.local, hash: 'c'.repeat(64), text: 'manually merged content' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'sync.conflicts.refresh' }))
    expect(await screen.findByText('manually merged content')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    vi.mocked(workspaceSyncApi.listConflicts).mockResolvedValue({ conflicts: [], binding })
    await userEvent.click(screen.getByRole('button', { name: 'sync.conflicts.useLocal' }))
    await waitFor(() =>
      expect(workspaceSyncApi.resolveConflict).toHaveBeenCalledWith(
        expect.objectContaining({ expectedLocalHash: 'c'.repeat(64), choice: 'local' }),
      ),
    )
    expect(await screen.findByText('sync.conflicts.none')).toBeInTheDocument()
  })

  it('switches comparison to the selected persisted conflict', async () => {
    const second = {
      ...conflict,
      path: 'second.md',
      reason: 'delete_vs_change' as const,
    }
    vi.mocked(workspaceSyncApi.listConflicts).mockResolvedValue({
      conflicts: [conflict, second],
      binding,
    })
    vi.mocked(workspaceSyncApi.readConflict).mockImplementation(async ({ path }) => ({
      ...comparison,
      conflict: path === second.path ? second : conflict,
      local: {
        ...comparison.local,
        text: path === second.path ? 'second local version' : 'local content',
      },
    }))
    createView()
    await screen.findByText('local content')
    await userEvent.click(screen.getByRole('button', { name: /second.md/ }))
    expect(await screen.findByText('second local version')).toBeInTheDocument()
    expect(workspaceSyncApi.readConflict).toHaveBeenCalledWith(
      expect.objectContaining({ path: second.path }),
    )
    expect(screen.queryByText('local content')).not.toBeInTheDocument()
  })
})
