import { describe, expect, it, vi } from 'vitest'
import {
  flushEditorChangesForClose,
  registerEditorBufferFlusher,
  registerEditorSnapshotFlusher,
} from '@/app/editorCloseLifecycle'

describe('editor close lifecycle', () => {
  it('serializes editor snapshots before waiting for buffer persistence', async () => {
    const order: string[] = []
    const removeSnapshot = registerEditorSnapshotFlusher(async () => {
      order.push('snapshot:start')
      await Promise.resolve()
      order.push('snapshot:done')
    })
    const removeBuffer = registerEditorBufferFlusher(async () => {
      order.push('buffer')
    })

    await flushEditorChangesForClose()

    expect(order).toEqual(['snapshot:start', 'snapshot:done', 'buffer'])
    removeSnapshot()
    removeBuffer()
  })

  it('unregisters lifecycle participants when their owner unmounts', async () => {
    const snapshot = vi.fn()
    const buffer = vi.fn()
    registerEditorSnapshotFlusher(snapshot)()
    registerEditorBufferFlusher(buffer)()

    await flushEditorChangesForClose()

    expect(snapshot).not.toHaveBeenCalled()
    expect(buffer).not.toHaveBeenCalled()
  })

  it('shares one close flush across concurrent native close requests', async () => {
    let finishSnapshot!: () => void
    const snapshot = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSnapshot = resolve
        }),
    )
    const buffer = vi.fn()
    const removeSnapshot = registerEditorSnapshotFlusher(snapshot)
    const removeBuffer = registerEditorBufferFlusher(buffer)

    const first = flushEditorChangesForClose()
    const second = flushEditorChangesForClose()
    expect(second).toBe(first)
    await Promise.resolve()
    expect(snapshot).toHaveBeenCalledOnce()
    finishSnapshot()
    await Promise.all([first, second])
    expect(buffer).toHaveBeenCalledOnce()

    removeSnapshot()
    removeBuffer()
  })
})
