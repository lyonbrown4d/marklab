import { describe, expect, it, vi } from 'vitest'
import { createEditorBufferSync } from '@/app/editorBufferSync'
import type { FsBufferUpdateRequest, FsBufferUpdateResult } from '@/services/fsApiSchemas'

describe('editor buffer session sync', () => {
  it('rejects a queued dirty update when its workspace binding is cancelled', async () => {
    let active = true
    let resolveFirst: ((result: FsBufferUpdateResult) => void) | undefined
    const applyBufferUpdate = vi
      .fn<(request: FsBufferUpdateRequest) => Promise<FsBufferUpdateResult>>()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirst = resolve
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
    const first = sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: '',
      content: 'a',
      shouldApply: () => active,
    })
    const second = sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: 'a',
      content: 'ab',
      shouldApply: () => active,
    })
    const secondRejection = expect(second).rejects.toThrow(/cancelled/i)

    await vi.waitFor(() => expect(applyBufferUpdate).toHaveBeenCalledOnce())
    active = false
    resolveFirst?.({
      kind: 'applied',
      path: 'note.md',
      revision: 1,
      dirty: true,
      session_generation: 3,
    } as never)

    await expect(first).resolves.toBeUndefined()
    await secondRejection
    expect(applyBufferUpdate).toHaveBeenCalledOnce()
  })

  it('never resynchronizes stale content into a different workspace session', async () => {
    const applyBufferUpdate = vi.fn(async (): Promise<FsBufferUpdateResult> => ({
      kind: 'session_mismatch',
      path: 'note.md',
      session_generation: 4,
    }))
    const sync = createEditorBufferSync({
      applyBufferUpdate,
      getBufferStatus: async () => ({
        path: 'note.md',
        revision: 2,
        dirty: false,
        session_generation: 3,
      }),
    })

    await expect(
      sync.enqueue({
        identity: 'old-workspace:note.md',
        path: 'note.md',
        previous: 'old',
        content: 'stale edit',
      }),
    ).rejects.toThrow(/workspace changed/i)
    expect(applyBufferUpdate).toHaveBeenCalledOnce()
  })
})
