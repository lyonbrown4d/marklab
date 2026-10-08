import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@electron/services/logger'
import { WorkspaceSearchIndexUpdateQueue } from '@electron/services/workspace/workspaceSearchIndexUpdateQueue'

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
  const applyChanges = vi.fn(async (): Promise<void> => undefined)
  const loadDocuments = vi.fn(async (paths: string[]) => paths.map((path) => ({ path })))
  const logger = createLogger()
  const openIndex = vi.fn(async () => undefined)
  const rebuildAll = vi.fn(async () => undefined)
  const runTaskSpy = vi.fn()
  const runTask = async <T>(work: () => Promise<T>, taskName: string): Promise<T> => {
    runTaskSpy(work, taskName)
    return work()
  }
  const queue = new WorkspaceSearchIndexUpdateQueue<SearchDocument>({
    applyChanges,
    delayMs: 100,
    getDocumentPath: (document) => document.path,
    loadDocuments,
    logger,
    openIndex,
    rebuildAll,
    runTask,
  })

  return {
    applyChanges,
    loadDocuments,
    logger,
    openIndex,
    queue,
    rebuildAll,
    runTask: runTaskSpy,
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
    const { applyChanges, loadDocuments, openIndex, queue } = createQueue()

    expect(queue.schedulePathChange('a.md', 'change')).toBe(true)
    expect(queue.schedulePathChange('b.md', 'add')).toBe(true)

    await vi.advanceTimersByTimeAsync(99)
    expect(openIndex).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(openIndex).toHaveBeenCalledTimes(1)
    expect(loadDocuments).toHaveBeenCalledWith(['a.md', 'b.md'], expect.any(AbortSignal))
    expect(applyChanges).toHaveBeenCalledWith(
      {
        removeDocuments: [],
        removePrefixes: [],
        upserts: [{ path: 'a.md' }, { path: 'b.md' }],
      },
      expect.any(AbortSignal),
    )

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
    const { applyChanges, loadDocuments, queue, rebuildAll } = createQueue()

    queue.schedulePathChange('a.md', 'change')
    queue.scheduleFullRebuild()
    await vi.advanceTimersByTimeAsync(100)

    expect(rebuildAll).toHaveBeenCalledTimes(1)
    expect(loadDocuments).not.toHaveBeenCalled()
    expect(applyChanges).not.toHaveBeenCalled()

    queue.dispose()
  })

  it('collapses child updates under a removed directory prefix', async () => {
    const { applyChanges, loadDocuments, queue } = createQueue()

    queue.schedulePathChange('folder/a.md', 'change')
    queue.schedulePathChange('folder', 'unlinkDir')
    await vi.advanceTimersByTimeAsync(100)

    expect(loadDocuments).toHaveBeenCalledWith([], expect.any(AbortSignal))
    expect(applyChanges).toHaveBeenCalledWith(
      {
        removeDocuments: [],
        removePrefixes: ['folder'],
        upserts: [],
      },
      expect.any(AbortSignal),
    )

    queue.dispose()
  })

  it('requeues the exact mutation batch when persistence fails', async () => {
    const { applyChanges, queue } = createQueue()
    applyChanges.mockRejectedValueOnce(new Error('disk full'))
    queue.schedulePathChange('a.md', 'change')

    await expect(queue.flushPending()).rejects.toThrow('disk full')
    expect(applyChanges).toHaveBeenCalledTimes(1)

    await queue.flushPending()
    expect(applyChanges).toHaveBeenCalledTimes(2)
    expect(applyChanges).toHaveBeenLastCalledWith(
      {
        removeDocuments: [],
        removePrefixes: [],
        upserts: [{ path: 'a.md' }],
      },
      expect.any(AbortSignal),
    )

    queue.dispose()
  })

  it('retains a failed mutation batch without automatically retrying it', async () => {
    const { applyChanges, queue } = createQueue()
    applyChanges.mockRejectedValue(new Error('disk full'))
    queue.schedulePathChange('a.md', 'change')

    await vi.advanceTimersByTimeAsync(100)
    expect(applyChanges).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(applyChanges).toHaveBeenCalledTimes(1)

    queue.dispose()
  })

  it('retries a failed mutation batch when a new file event arrives', async () => {
    const { applyChanges, queue } = createQueue()
    applyChanges.mockRejectedValueOnce(new Error('disk full'))
    queue.schedulePathChange('a.md', 'change')
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(500)

    queue.schedulePathChange('b.md', 'change')
    await vi.advanceTimersByTimeAsync(100)

    expect(applyChanges).toHaveBeenCalledTimes(2)
    expect(applyChanges).toHaveBeenLastCalledWith(
      {
        removeDocuments: [],
        removePrefixes: [],
        upserts: [{ path: 'a.md' }, { path: 'b.md' }],
      },
      expect.any(AbortSignal),
    )

    queue.dispose()
  })

  it('retries a failed rebuild when a new file event arrives', async () => {
    const { applyChanges, queue, rebuildAll } = createQueue()
    rebuildAll.mockRejectedValueOnce(new Error('disk full'))
    queue.scheduleFullRebuild()
    await vi.advanceTimersByTimeAsync(100)
    await vi.advanceTimersByTimeAsync(500)

    queue.schedulePathChange('a.md', 'change')
    await vi.advanceTimersByTimeAsync(100)

    expect(rebuildAll).toHaveBeenCalledTimes(2)
    expect(applyChanges).not.toHaveBeenCalled()

    queue.dispose()
  })

  it('removes an indexed document when an upsert target no longer loads', async () => {
    const { applyChanges, loadDocuments, queue } = createQueue()
    loadDocuments.mockResolvedValueOnce([])
    queue.schedulePathChange('missing.md', 'change')

    await queue.flushPending()

    expect(applyChanges).toHaveBeenCalledWith(
      {
        removeDocuments: ['missing.md'],
        removePrefixes: [],
        upserts: [],
      },
      expect.any(AbortSignal),
    )
    queue.dispose()
  })

  it('serializes flushes so a failed older update cannot overwrite a newer change', async () => {
    const { applyChanges, queue } = createQueue()
    let rejectFirst!: (error: Error) => void
    const firstWrite = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    applyChanges.mockReturnValueOnce(firstWrite)
    queue.schedulePathChange('note.md', 'change')
    const firstFlush = queue.flushPending()
    await Promise.resolve()
    await Promise.resolve()

    queue.schedulePathChange('note.md', 'unlink')
    const secondFlush = queue.flushPending()
    rejectFirst(new Error('first write failed'))

    await expect(firstFlush).rejects.toThrow('first write failed')
    await secondFlush
    await queue.flushPending()

    expect(applyChanges).toHaveBeenCalledTimes(2)
    expect(applyChanges).toHaveBeenLastCalledWith(
      {
        removeDocuments: ['note.md'],
        removePrefixes: [],
        upserts: [],
      },
      expect.any(AbortSignal),
    )
    queue.dispose()
  })

  it('does not restore a failed batch after the queue is cleared', async () => {
    const { applyChanges, queue } = createQueue()
    let rejectFirst!: (error: Error) => void
    const firstWrite = new Promise<void>((_resolve, reject) => {
      rejectFirst = reject
    })
    applyChanges.mockReturnValueOnce(firstWrite)
    queue.schedulePathChange('workspace-a.md', 'change')
    const firstFlush = queue.flushPending()
    await vi.waitFor(() => expect(applyChanges).toHaveBeenCalledOnce())

    queue.clear()
    queue.schedulePathChange('workspace-b.md', 'change')
    rejectFirst(new Error('workspace A write failed'))

    await expect(firstFlush).resolves.toBeUndefined()
    await queue.flushPending()

    expect(applyChanges).toHaveBeenCalledTimes(2)
    expect(applyChanges).toHaveBeenLastCalledWith(
      {
        removeDocuments: [],
        removePrefixes: [],
        upserts: [{ path: 'workspace-b.md' }],
      },
      expect.any(AbortSignal),
    )
    queue.dispose()
  })
})
