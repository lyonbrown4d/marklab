import { describe, expect, it, vi } from 'vitest'
import { createEditorBufferPersistence } from '@/app/useEditorBufferState'

describe('editor buffer persistence', () => {
  it('blocks a flush when a tracked dirty update was cancelled', async () => {
    const persistence = createEditorBufferPersistence()
    const cancelled = Promise.reject(new Error('Editor buffer update cancelled'))
    void cancelled.catch(() => undefined)
    persistence.trackUpdate(cancelled, 'workspace:note.md')
    const persist = vi.fn(async () => undefined)

    await expect(persistence.flush(persist, vi.fn())).rejects.toMatchObject({
      errors: [expect.objectContaining({ message: expect.stringMatching(/cancelled/i) })],
    })
    expect(persist).not.toHaveBeenCalled()
  })
})
