import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@electron/services/logger.js'
import { WorkspaceSearchIndexUpdateQueue } from '@electron/services/workspace/workspaceSearchIndexUpdateQueue.js'

type SearchDocument = {
  path: string
}

const createLogger = (): Logger => {
  const logger = {
    child: vi.fn(() => logger),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  return logger as unknown as Logger
}

const createQueue = () => {
  const loadDocuments = vi.fn(async (paths: string[]) => paths.map((path) => ({ path })))
  const logger = createLogger()
  const openIndex = vi.fn(async () => undefined)
  const rebuildAll = vi.fn(async () => undefined)
  const removeDocument = vi.fn(async () => undefined)
  const removePathPrefix = vi.fn(async () => undefined)
  const runTaskSpy = vi.fn()
  const runTask = async <T>(work: () => Promise<T>, taskName: string): Promise<T> => {
    runTaskSpy(work, taskName)
    return work()
  }
  const upsertDocument = vi.fn(async () => undefined)
  const queue = new WorkspaceSearchIndexUpdateQueue<SearchDocument>({
    delayMs: 100,
    loadDocuments,
    logger,
    openIndex,
    rebuildAll,
    removeDocument,
    removePathPrefix,
    runTask,
    upsertDocument,
  })

  return {
    loadDocuments,
    logger,
    openIndex,
    queue,
    rebuildAll,
    removeDocument,
    removePathPrefix,
    runTask: runTaskSpy,
    upsertDocument,
  }
}

describe('WorkspaceSearchIndexUpdateQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces path changes and batches upserts', async () => {
    const { loadDocuments, openIndex, queue, upsertDocument } = createQueue()

    expect(queue.schedulePathChange('a.md', 'change')).toBe(true)
    expect(queue.schedulePathChange('b.md', 'add')).toBe(true)

    await vi.advanceTimersByTimeAsync(99)
    expect(openIndex).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(openIndex).toHaveBeenCalledTimes(1)
    expect(loadDocuments).toHaveBeenCalledWith(['a.md', 'b.md'])
    expect(upsertDocument).toHaveBeenCalledTimes(2)
    expect(upsertDocument).toHaveBeenNthCalledWith(1, { path: 'a.md' })
    expect(upsertDocument).toHaveBeenNthCalledWith(2, { path: 'b.md' })

    queue.dispose()
  })

  it('flushes pending changes immediately and cancels the scheduled flush', async () => {
    const { queue, runTask } = createQueue()

    queue.schedulePathChange('a.md', 'change')
    await queue.flushPending()
    await vi.advanceTimersByTimeAsync(100)

    expect(runTask).toHaveBeenCalledTimes(1)

    queue.dispose()
  })

  it('cancels scheduled work when cleared', async () => {
    const { openIndex, queue } = createQueue()

    queue.schedulePathChange('a.md', 'change')
    queue.clear()
    await vi.advanceTimersByTimeAsync(100)

    expect(openIndex).not.toHaveBeenCalled()

    queue.dispose()
  })

  it('runs full rebuilds without applying pending path updates', async () => {
    const { loadDocuments, queue, rebuildAll, upsertDocument } = createQueue()

    queue.schedulePathChange('a.md', 'change')
    queue.scheduleFullRebuild()
    await vi.advanceTimersByTimeAsync(100)

    expect(rebuildAll).toHaveBeenCalledTimes(1)
    expect(loadDocuments).not.toHaveBeenCalled()
    expect(upsertDocument).not.toHaveBeenCalled()

    queue.dispose()
  })

  it('collapses child updates under a removed directory prefix', async () => {
    const { loadDocuments, queue, removePathPrefix, upsertDocument } = createQueue()

    queue.schedulePathChange('folder/a.md', 'change')
    queue.schedulePathChange('folder', 'unlinkDir')
    await vi.advanceTimersByTimeAsync(100)

    expect(removePathPrefix).toHaveBeenCalledWith('folder')
    expect(loadDocuments).toHaveBeenCalledWith([])
    expect(upsertDocument).not.toHaveBeenCalled()

    queue.dispose()
  })
})
