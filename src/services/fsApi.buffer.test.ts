import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fsApi } from '@/services/fsApi'
const native = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/runtime/ipc', () => ({ invoke: native.invoke }))
beforeEach(() => native.invoke.mockReset())

describe('versioned filesystem buffers', () => {
  it('loads content and revision through one atomic native command', async () => {
    const snapshot = {
      path: 'note.md',
      content: 'loaded',
      revision: 4,
      dirty: false,
      session_generation: 2,
    }
    native.invoke.mockResolvedValue(snapshot)
    expect(await fsApi.openBufferSnapshot('note.md')).toEqual(snapshot)
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('fs_open_buffer_snapshot', {
      path: 'note.md',
    })
  })
  it('uses the editor loaded revision and never retries a rejected stale snapshot', async () => {
    native.invoke.mockResolvedValue({
      kind: 'resync_required',
      path: 'note.md',
      revision: 8,
      session_generation: 2,
    })
    await expect(
      fsApi.updateBuffer('note.md', 'stale', {
        path: 'note.md',
        revision: 4,
        dirty: false,
        session_generation: 2,
      }),
    ).rejects.toThrow(/another editor/i)
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('fs_apply_buffer_update', {
      path: 'note.md',
      base_revision: 4,
      session_generation: 2,
      update: { kind: 'snapshot', content: 'stale' },
    })
  })
})
