import { beforeEach, describe, expect, it, vi } from 'vitest'
import { invoke } from '@/runtime/ipc'
import { fsApi } from '@/services/fsApi'

vi.mock('@/runtime/ipc', () => ({ invoke: vi.fn() }))

const baseRequest = {
  path: 'note.md',
  base_revision: 1,
  session_generation: 2,
} as const

describe('fsApi buffer update boundary', () => {
  beforeEach(() => vi.mocked(invoke).mockReset())

  it.each([
    {
      label: 'too many changes',
      update: {
        kind: 'patch',
        changes: Array.from({ length: 1_001 }, () => ({
          offset: 0,
          delete_length: 0,
          insert_text: '',
        })),
      },
    },
    {
      label: 'too much inserted text',
      update: {
        kind: 'patch',
        changes: [{ offset: 0, delete_length: 0, insert_text: 'x'.repeat(1_048_577) }],
      },
    },
    {
      label: 'an oversized snapshot',
      update: { kind: 'snapshot', content: 'x'.repeat(16_777_217) },
    },
  ])('rejects $label before invoking Electron', async ({ update }) => {
    await expect(fsApi.applyBufferUpdate({ ...baseRequest, update } as never)).rejects.toThrow()
    expect(invoke).not.toHaveBeenCalled()
  })
})
