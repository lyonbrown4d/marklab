import { describe, expect, it, vi } from 'vitest'
import { createEditorBufferSync } from '@/app/editorBufferSync'
import type { FsBufferUpdateRequest, FsBufferUpdateResult } from '@/services/fsApiSchemas'

const applied = async (request: FsBufferUpdateRequest): Promise<FsBufferUpdateResult> => ({
  kind: 'applied',
  path: request.path,
  revision: request.base_revision + 1,
  dirty: true,
  session_generation: request.session_generation,
})
const status = (revision = 0) => ({
  path: 'note.md',
  revision,
  dirty: false,
  session_generation: 3,
})

describe('editor buffer incremental sync', () => {
  it('sends a bounded patch using the revision captured with the loaded text', async () => {
    const applyBufferUpdate = vi.fn(applied)
    const sync = createEditorBufferSync({ applyBufferUpdate })
    const before = 'a'.repeat(1_000_000)
    sync.seed('note', before, status(4))
    await sync.enqueue({
      identity: 'note',
      path: 'note.md',
      previous: before,
      content: before + '!',
      changes: [{ offset: before.length, delete_length: 0, insert_text: '!' }],
    })
    expect(applyBufferUpdate).toHaveBeenCalledWith({
      path: 'note.md',
      base_revision: 4,
      session_generation: 3,
      update: {
        kind: 'patch',
        changes: [{ offset: before.length, delete_length: 0, insert_text: '!' }],
      },
    })
    expect(JSON.stringify(applyBufferUpdate.mock.calls[0]?.[0]).length).toBeLessThan(300)
  })

  it('does not replay a stale snapshot after another editor advances the shared revision', async () => {
    let revision = 0
    let content = 'loaded'
    const applyBufferUpdate = vi.fn(
      async (request: FsBufferUpdateRequest): Promise<FsBufferUpdateResult> => {
        if (request.base_revision !== revision)
          return { kind: 'resync_required', path: request.path, revision, session_generation: 3 }
        if (request.update.kind === 'snapshot') content = request.update.content
        else
          for (const change of [...request.update.changes].reverse())
            content =
              content.slice(0, change.offset) +
              change.insert_text +
              content.slice(change.offset + change.delete_length)
        revision += 1
        return { kind: 'applied', path: request.path, revision, dirty: true, session_generation: 3 }
      },
    )
    const first = createEditorBufferSync({ applyBufferUpdate })
    const second = createEditorBufferSync({ applyBufferUpdate })
    first.seed('first', content, status())
    second.seed('second', content, status())
    await first.enqueue({
      identity: 'first',
      path: 'note.md',
      previous: 'loaded',
      content: 'first editor',
    })
    await expect(
      second.enqueue({
        identity: 'second',
        path: 'note.md',
        previous: 'loaded',
        content: 'stale second',
      }),
    ).rejects.toThrow(/another editor/i)
    await expect(
      second.enqueue({
        identity: 'second',
        path: 'note.md',
        previous: 'stale second',
        content: 'still stale',
      }),
    ).rejects.toThrow(/another editor/i)
    expect(content).toBe('first editor')
    expect(revision).toBe(1)
    expect(applyBufferUpdate).toHaveBeenCalledTimes(2)
    second.seed('second', content, status(revision))
    await second.enqueue({
      identity: 'second',
      path: 'note.md',
      previous: 'first editor',
      content: 'reloaded second',
    })
    expect(content).toBe('reloaded second')
  })

  it('keeps queued revisions in order and only reports the latest acknowledgement', async () => {
    const applyBufferUpdate = vi.fn(applied)
    const sync = createEditorBufferSync({ applyBufferUpdate })
    sync.seed('note', '', status())
    const loadedRevision = sync.revisionFor('note')
    const seen: string[] = []
    const first = sync.enqueue({
      identity: 'note',
      path: 'note.md',
      previous: '',
      content: 'a',
      onApplied: () => seen.push('a'),
    })
    const second = sync.enqueue({
      identity: 'note',
      path: 'note.md',
      previous: 'a',
      content: 'ab',
      onApplied: () => seen.push('ab'),
    })
    await Promise.all([first, second])
    expect(seen).toEqual(['ab'])
    expect(applyBufferUpdate.mock.calls.map(([request]) => request.base_revision)).toEqual([0, 1])
    sync.forget('note')
    await sync.enqueue({
      identity: 'note',
      path: 'note.md',
      previous: 'ab',
      content: 'abc',
      loadedRevision,
    })
    expect(applyBufferUpdate.mock.calls[2]?.[0].base_revision).toBe(2)
  })

  it('keeps an uncertain failure blocked until a fresh content/revision snapshot is loaded', async () => {
    const applyBufferUpdate = vi.fn(applied).mockRejectedValueOnce(new Error('IPC reply was lost'))
    const sync = createEditorBufferSync({ applyBufferUpdate })
    sync.seed('note', '', status(4))
    await expect(
      sync.enqueue({ identity: 'note', path: 'note.md', previous: '', content: 'a' }),
    ).rejects.toThrow('IPC reply was lost')
    await expect(
      sync.enqueue({ identity: 'note', path: 'note.md', previous: 'a', content: 'ab' }),
    ).rejects.toThrow('IPC reply was lost')
    expect(applyBufferUpdate).toHaveBeenCalledOnce()
    sync.seed('note', 'server text', status(5))
    await sync.enqueue({
      identity: 'note',
      path: 'note.md',
      previous: 'server text',
      content: 'fresh edit',
    })
    expect(applyBufferUpdate.mock.calls[1]?.[0].base_revision).toBe(5)
  })

  it('rejects unversioned content and edits that do not derive from the acknowledged document', async () => {
    const applyBufferUpdate = vi.fn(applied)
    const sync = createEditorBufferSync({ applyBufferUpdate })
    await expect(
      sync.enqueue({ identity: 'missing', path: 'note.md', previous: '', content: 'x' }),
    ).rejects.toThrow(/versioned/i)
    sync.seed('note', 'current', status())
    await expect(
      sync.enqueue({ identity: 'note', path: 'note.md', previous: 'stale', content: 'overwrite' }),
    ).rejects.toThrow(/loaded revision/i)
    expect(applyBufferUpdate).not.toHaveBeenCalled()
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
    const sync = createEditorBufferSync({ applyBufferUpdate })
    sync.seed('workspace:large.md', before, {
      path: 'large.md',
      revision: 1,
      dirty: false,
      session_generation: 3,
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
