import { describe, expect, it, vi } from 'vitest'
import { createEditorBufferPersistence } from '@/app/useEditorBufferState'

describe('editor buffer persistence', () => {
  it('clears an obsolete failure after a versioned reload, including late old replies', async () => {
    const persistence = createEditorBufferPersistence()
    let rejectOld!: (error: Error) => void
    const old = new Promise<void>((_resolve, reject) => {
      rejectOld = reject
    })
    persistence.trackUpdate(old, 'note')
    persistence.resetDocument('note')
    rejectOld(new Error('Obsolete edit failed'))
    const persist = vi.fn(async () => undefined)
    await expect(persistence.flush(persist, vi.fn())).resolves.toBeUndefined()
    expect(persist).toHaveBeenCalledOnce()
    persistence.trackUpdate(Promise.reject(new Error('Current edit failed')), 'note')
    await expect(persistence.flush(persist, vi.fn())).rejects.toThrow(/updates failed/)
    persistence.resetDocument('note')
    await expect(persistence.flush(persist, vi.fn())).resolves.toBeUndefined()
  })

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
