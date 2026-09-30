import { beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke } from '@/runtime/ipc'
import { localHistoryApi } from '@/services/localHistoryApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

const entry = {
  id: '1727683200000-00000000-0000-4000-8000-000000000000',
  path: 'guide.md',
  created_at: '2026-09-30T10:00:00.000Z',
  size_bytes: 8,
  content_hash: 'a'.repeat(64),
  source: 'save',
}

describe('localHistoryApi', () => {
  beforeEach(() => vi.mocked(invoke).mockReset())

  it('lists and reads validated local versions', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce([entry])
      .mockResolvedValueOnce({
        ...entry,
        content: '# Guide\n',
      })

    await expect(localHistoryApi.list('guide.md')).resolves.toEqual([entry])
    await expect(localHistoryApi.read('guide.md', entry.id)).resolves.toMatchObject({
      content: '# Guide\n',
    })
    expect(invoke).toHaveBeenNthCalledWith(1, 'local_history_list', { path: 'guide.md' })
    expect(invoke).toHaveBeenNthCalledWith(2, 'local_history_read', {
      entryId: entry.id,
      path: 'guide.md',
    })
  })

  it('restores, deletes, and clears through explicit commands', async () => {
    vi.mocked(invoke)
      .mockResolvedValueOnce({ ...entry, content: '# Guide\n' })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ deleted: 1 })

    await localHistoryApi.restore('guide.md', entry.id)
    await localHistoryApi.delete('guide.md', entry.id)
    await localHistoryApi.clear('guide.md')

    expect(invoke).toHaveBeenNthCalledWith(1, 'local_history_restore', {
      entryId: entry.id,
      path: 'guide.md',
    })
    expect(invoke).toHaveBeenNthCalledWith(2, 'local_history_delete', {
      entryId: entry.id,
      path: 'guide.md',
    })
    expect(invoke).toHaveBeenNthCalledWith(3, 'local_history_clear', { path: 'guide.md' })
  })

  it('rejects malformed native responses', async () => {
    vi.mocked(invoke).mockResolvedValue([{ ...entry, size_bytes: -1 }])
    await expect(localHistoryApi.list('guide.md')).rejects.toThrow()
  })
})
