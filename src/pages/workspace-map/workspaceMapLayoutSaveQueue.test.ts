import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceMapLayoutSaveQueue } from '@/pages/workspace-map/workspaceMapLayoutSaveQueue'
import type { GraphLayoutSave } from '@/services/graphLayoutApi'

const createSave = (x: number, layoutKey = 'workspace-map:overview'): GraphLayoutSave => ({
  engineVersion: 'elk-workspace-map-v1',
  graphRevision: 'revision-a',
  layoutKey,
  mode: 'overview',
  nodes: [
    {
      collapsed: false,
      height: 240,
      id: 'file:a.md',
      pinned: false,
      userModified: true,
      width: 360,
      x,
      y: 20,
    },
  ],
  viewport: { x: 0, y: 0, zoom: 1 },
})

const createQueue = () => {
  const onError = vi.fn()
  const save = vi.fn(async (): Promise<void> => undefined)
  const queue = new WorkspaceMapLayoutSaveQueue({ delayMs: 320, onError, save })
  return { onError, queue, save }
}

describe('WorkspaceMapLayoutSaveQueue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces rapid changes and saves only the latest complete batch', async () => {
    const { queue, save } = createQueue()

    queue.schedule(createSave(10))
    queue.schedule(createSave(20))
    await vi.advanceTimersByTimeAsync(319)
    expect(save).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(save).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledWith(createSave(20))
    queue.dispose()
  })

  it('does not persist an unchanged layout twice', async () => {
    const { queue, save } = createQueue()

    queue.schedule(createSave(10))
    await vi.advanceTimersByTimeAsync(320)
    queue.schedule(createSave(10))
    await vi.advanceTimersByTimeAsync(320)

    expect(save).toHaveBeenCalledOnce()
    queue.dispose()
  })

  it('flushes immediately and cancels the scheduled save', async () => {
    const { queue, save } = createQueue()

    queue.schedule(createSave(10))
    await queue.flushPending()
    await vi.advanceTimersByTimeAsync(320)

    expect(save).toHaveBeenCalledOnce()
    queue.dispose()
  })

  it('serializes saves so an older in-flight write cannot finish after a newer write', async () => {
    let resolveFirst!: () => void
    const firstWrite = new Promise<void>((resolve) => {
      resolveFirst = resolve
    })
    const save = vi
      .fn<(value: GraphLayoutSave) => Promise<void>>()
      .mockReturnValueOnce(firstWrite)
      .mockResolvedValue(undefined)
    const queue = new WorkspaceMapLayoutSaveQueue({
      delayMs: 320,
      onError: vi.fn(),
      save,
    })

    queue.schedule(createSave(10))
    const firstFlush = queue.flushPending()
    await Promise.resolve()
    queue.schedule(createSave(20))
    const secondFlush = queue.flushPending()
    await Promise.resolve()
    expect(save).toHaveBeenCalledOnce()

    resolveFirst()
    await Promise.all([firstFlush, secondFlush])
    expect(save).toHaveBeenNthCalledWith(2, createSave(20))
    queue.dispose()
  })

  it('reports a failed automatic save and continues with later changes', async () => {
    const { onError, queue, save } = createQueue()
    const error = new Error('disk full')
    save.mockRejectedValueOnce(error)

    queue.schedule(createSave(10))
    await vi.advanceTimersByTimeAsync(320)
    expect(onError).toHaveBeenCalledWith(error)

    queue.schedule(createSave(20))
    await vi.advanceTimersByTimeAsync(320)
    expect(save).toHaveBeenCalledTimes(2)
    queue.dispose()
  })

  it('allows the same layout to be retried after a failed save', async () => {
    const { queue, save } = createQueue()
    save.mockRejectedValueOnce(new Error('disk full'))

    queue.schedule(createSave(10))
    await vi.advanceTimersByTimeAsync(320)
    queue.schedule(createSave(10))
    await vi.advanceTimersByTimeAsync(320)

    expect(save).toHaveBeenCalledTimes(2)
    queue.dispose()
  })
})
