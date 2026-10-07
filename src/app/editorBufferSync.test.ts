import { describe, expect, it, vi } from 'vitest'
import { createEditorBufferSync } from '@/app/editorBufferSync'
import type { FsBufferUpdateRequest, FsBufferUpdateResult } from '@/services/fsApiSchemas'

describe('editor buffer incremental sync', () => {
  it('sends a small native change instead of a large document snapshot', async () => {
    const applyBufferUpdate = vi.fn(
      async (request: FsBufferUpdateRequest): Promise<FsBufferUpdateResult> => ({
        kind: 'applied',
        path: request.path,
        revision: request.base_revision + 1,
        dirty: true,
        session_generation: request.session_generation,
      }),
    )
    const sync = createEditorBufferSync({
      applyBufferUpdate,
      getBufferStatus: async () => ({
        path: 'large.md',
        revision: 4,
        dirty: false,
        session_generation: 3,
      }),
    })
    const before = 'a'.repeat(1_000_000)
    const after = before + '!'

    await sync.enqueue({
      identity: 'workspace:large.md',
      path: 'large.md',
      previous: before,
      content: after,
      changes: [{ offset: before.length, delete_length: 0, insert_text: '!' }],
    })

    const request = applyBufferUpdate.mock.calls[0]?.[0]
    expect(request?.update).toEqual({
      kind: 'patch',
      changes: [{ offset: before.length, delete_length: 0, insert_text: '!' }],
    })
    expect(JSON.stringify(request).length).toBeLessThan(300)
  })

  it('resynchronizes with a controlled snapshot after a revision mismatch', async () => {
    const applyBufferUpdate = vi
      .fn<(request: FsBufferUpdateRequest) => Promise<FsBufferUpdateResult>>()
      .mockResolvedValueOnce({
        kind: 'resync_required',
        path: 'note.md',
        revision: 7,
        session_generation: 3,
      })
      .mockResolvedValueOnce({
        kind: 'applied',
        path: 'note.md',
        revision: 8,
        dirty: true,
        session_generation: 3,
      })
    const sync = createEditorBufferSync({
      applyBufferUpdate,
      getBufferStatus: async () => ({
        path: 'note.md',
        revision: 2,
        dirty: false,
        session_generation: 3,
      }),
    })

    await sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: 'old',
      content: 'new',
      changes: [{ offset: 0, delete_length: 3, insert_text: 'new' }],
    })

    expect(applyBufferUpdate).toHaveBeenNthCalledWith(2, {
      path: 'note.md',
      base_revision: 7,
      session_generation: 3,
      update: { kind: 'snapshot', content: 'new' },
    })
  })

  it('keeps a newer queued result authoritative when an older response settles first', async () => {
    const applyBufferUpdate = vi.fn(
      async (request: FsBufferUpdateRequest): Promise<FsBufferUpdateResult> => ({
        kind: 'applied',
        path: request.path,
        revision: request.base_revision + 1,
        dirty: true,
        session_generation: request.session_generation,
      }),
    )
    const sync = createEditorBufferSync({
      applyBufferUpdate,
      getBufferStatus: async () => ({
        path: 'note.md',
        revision: 0,
        dirty: false,
        session_generation: 3,
      }),
    })
    const seen: string[] = []

    const first = sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: '',
      content: 'a',
      changes: [{ offset: 0, delete_length: 0, insert_text: 'a' }],
      onApplied: () => seen.push('a'),
    })
    const second = sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: 'a',
      content: 'ab',
      changes: [{ offset: 1, delete_length: 0, insert_text: 'b' }],
      onApplied: () => seen.push('ab'),
    })
    await Promise.all([first, second])

    expect(seen).toEqual(['ab'])
    expect(applyBufferUpdate.mock.calls.map(([request]) => request.base_revision)).toEqual([0, 1])
  })

  it('forces a checkpoint from a freshly acknowledged revision after an uncertain failure', async () => {
    const applyBufferUpdate = vi
      .fn<(request: FsBufferUpdateRequest) => Promise<FsBufferUpdateResult>>()
      .mockRejectedValueOnce(new Error('IPC reply was lost'))
      .mockResolvedValueOnce({
        kind: 'applied',
        path: 'note.md',
        revision: 6,
        dirty: true,
        session_generation: 3,
      })
    const getBufferStatus = vi
      .fn()
      .mockResolvedValueOnce({
        path: 'note.md',
        revision: 4,
        dirty: false,
        session_generation: 3,
      })
      .mockResolvedValueOnce({
        path: 'note.md',
        revision: 5,
        dirty: true,
        session_generation: 3,
      })
    const sync = createEditorBufferSync({ applyBufferUpdate, getBufferStatus })

    await expect(
      sync.enqueue({
        identity: 'workspace:note.md',
        path: 'note.md',
        previous: '',
        content: 'a',
        changes: [{ offset: 0, delete_length: 0, insert_text: 'a' }],
      }),
    ).rejects.toThrow('IPC reply was lost')
    await sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: 'a',
      content: 'ab',
      changes: [{ offset: 1, delete_length: 0, insert_text: 'b' }],
    })

    expect(getBufferStatus).toHaveBeenCalledTimes(2)
    expect(applyBufferUpdate).toHaveBeenNthCalledWith(2, {
      path: 'note.md',
      base_revision: 5,
      session_generation: 3,
      update: { kind: 'snapshot', content: 'ab' },
    })
  })

  it('uses a checkpoint when a queued edit is not based on acknowledged content', async () => {
    const applyBufferUpdate = vi.fn(
      async (request: FsBufferUpdateRequest): Promise<FsBufferUpdateResult> => ({
        kind: 'applied',
        path: request.path,
        revision: request.base_revision + 1,
        dirty: true,
        session_generation: request.session_generation,
      }),
    )
    const sync = createEditorBufferSync({
      applyBufferUpdate,
      getBufferStatus: async () => ({
        path: 'note.md',
        revision: 0,
        dirty: false,
        session_generation: 3,
      }),
    })

    await sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: '',
      content: 'a',
      changes: [{ offset: 0, delete_length: 0, insert_text: 'a' }],
    })
    await sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: 'stale',
      content: 'latest',
      changes: [{ offset: 0, delete_length: 5, insert_text: 'latest' }],
    })

    expect(applyBufferUpdate).toHaveBeenNthCalledWith(2, {
      path: 'note.md',
      base_revision: 1,
      session_generation: 3,
      update: { kind: 'snapshot', content: 'latest' },
    })
  })

  it('validates one thousand native changes against a large document in linear time', async () => {
    const before = '0123456789'.repeat(400_000)
    const changes = Array.from({ length: 1_000 }, (_, index) => ({
      offset: index * 4_000,
      delete_length: 1,
      insert_text: String(index % 10),
    }))
    const pieces: string[] = []
    let cursor = 0
    for (const change of changes) {
      pieces.push(before.slice(cursor, change.offset), change.insert_text)
      cursor = change.offset + change.delete_length
    }
    pieces.push(before.slice(cursor))
    const content = pieces.join('')
    const applyBufferUpdate = vi.fn(
      async (request: FsBufferUpdateRequest): Promise<FsBufferUpdateResult> => ({
        kind: 'applied',
        path: request.path,
        revision: request.base_revision + 1,
        dirty: true,
        session_generation: request.session_generation,
      }),
    )
    const sync = createEditorBufferSync({
      applyBufferUpdate,
      getBufferStatus: async () => ({
        path: 'large.md',
        revision: 1,
        dirty: false,
        session_generation: 3,
      }),
    })
    const startedAt = performance.now()

    await sync.enqueue({
      identity: 'workspace:large.md',
      path: 'large.md',
      previous: before,
      content,
      changes,
    })

    expect(performance.now() - startedAt).toBeLessThan(250)
    expect(applyBufferUpdate.mock.calls[0]?.[0].update).toEqual({ kind: 'patch', changes })
  })
})
