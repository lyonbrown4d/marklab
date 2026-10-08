import { describe, expect, it, vi } from 'vitest'

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

describe('WorkspaceSearchIndexUpdateQueue cancellation', () => {
  it('starts a new generation without waiting for an unresolved previous generation', async () => {
    let finishOldLoad!: (documents: SearchDocument[]) => void
    const oldLoad = new Promise<SearchDocument[]>((resolve) => {
      finishOldLoad = resolve
    })
    const applyChanges = vi.fn(async () => undefined)
    const loadDocuments = vi
      .fn<(paths: string[]) => Promise<SearchDocument[]>>()
      .mockReturnValueOnce(oldLoad)
      .mockImplementation(async (paths) => paths.map((path) => ({ path })))
    const queue = new WorkspaceSearchIndexUpdateQueue<SearchDocument>({
      applyChanges,
      delayMs: 100,
      getDocumentPath: (document) => document.path,
      loadDocuments,
      logger: createLogger(),
      openIndex: vi.fn(async () => undefined),
      rebuildAll: vi.fn(async () => undefined),
      runTask: (work) => work(),
    })

    queue.schedulePathChange('workspace-a.md', 'change')
    const oldFlush = queue.flushPending()
    await vi.waitFor(() => expect(loadDocuments).toHaveBeenCalledOnce())

    queue.clear()
    queue.schedulePathChange('workspace-b.md', 'change')
    await queue.flushPending()

    expect(loadDocuments).toHaveBeenCalledTimes(2)
    expect(applyChanges).toHaveBeenCalledWith(
      {
        removeDocuments: [],
        removePrefixes: [],
        upserts: [{ path: 'workspace-b.md' }],
      },
      expect.any(AbortSignal),
    )

    finishOldLoad([{ path: 'workspace-a.md' }])
    await oldFlush
    queue.dispose()
  })

  it('aborts a running load and treats generation cancellation as a settled flush', async () => {
    let receivedSignal: AbortSignal | undefined
    const taskFailures: unknown[] = []
    const applyChanges = vi.fn(async () => undefined)
    const loadDocuments = vi.fn(
      (_paths: string[], signal?: AbortSignal): Promise<SearchDocument[]> => {
        receivedSignal = signal
        return new Promise((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('This operation was aborted', 'AbortError')),
            { once: true },
          )
        })
      },
    )
    const logger = createLogger()
    const queue = new WorkspaceSearchIndexUpdateQueue<SearchDocument>({
      applyChanges,
      delayMs: 100,
      getDocumentPath: (document) => document.path,
      loadDocuments,
      logger,
      openIndex: vi.fn(async () => undefined),
      rebuildAll: vi.fn(async () => undefined),
      runTask: async (work) => {
        try {
          return await work()
        } catch (error) {
          taskFailures.push(error)
          throw error
        }
      },
    })

    queue.schedulePathChange('workspace-a.md', 'change')
    const flush = queue.flushPending()
    await vi.waitFor(() => expect(loadDocuments).toHaveBeenCalledOnce())

    queue.clear()

    expect(receivedSignal?.aborted).toBe(true)
    await expect(flush).resolves.toBeUndefined()
    expect(applyChanges).not.toHaveBeenCalled()
    expect(taskFailures).toEqual([])
    expect(logger.warn).not.toHaveBeenCalled()
    queue.dispose()
  })

  it('aborts running work when disposed without leaking a rejected flush', async () => {
    let receivedSignal: AbortSignal | undefined
    const openIndex = vi.fn((signal?: AbortSignal): Promise<void> => {
      receivedSignal = signal
      return new Promise((_resolve, reject) => {
        signal?.addEventListener(
          'abort',
          () => reject(new DOMException('This operation was aborted', 'AbortError')),
          { once: true },
        )
      })
    })
    const logger = createLogger()
    const queue = new WorkspaceSearchIndexUpdateQueue<SearchDocument>({
      applyChanges: vi.fn(async () => undefined),
      delayMs: 100,
      getDocumentPath: (document) => document.path,
      loadDocuments: vi.fn(async () => []),
      logger,
      openIndex,
      rebuildAll: vi.fn(async () => undefined),
      runTask: (work) => work(),
    })

    queue.scheduleFullRebuild()
    const flush = queue.flushPending()
    await vi.waitFor(() => expect(openIndex).toHaveBeenCalledOnce())

    queue.dispose()

    expect(receivedSignal?.aborted).toBe(true)
    await expect(flush).resolves.toBeUndefined()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('does not apply a loaded batch after the queue is cleared', async () => {
    let resolveDocuments!: (documents: SearchDocument[]) => void
    const documents = new Promise<SearchDocument[]>((resolve) => {
      resolveDocuments = resolve
    })
    const applyChanges = vi.fn(async () => undefined)
    const loadDocuments = vi.fn(() => documents)
    const rebuildAll = vi.fn(async () => undefined)
    const queue = new WorkspaceSearchIndexUpdateQueue<SearchDocument>({
      applyChanges,
      delayMs: 100,
      getDocumentPath: (document) => document.path,
      loadDocuments,
      logger: createLogger(),
      openIndex: vi.fn(async () => undefined),
      rebuildAll,
      runTask: (work) => work(),
    })

    queue.schedulePathChange('workspace-a.md', 'change')
    const flush = queue.flushPending()
    await vi.waitFor(() => expect(loadDocuments).toHaveBeenCalledOnce())

    queue.clear()
    resolveDocuments([{ path: 'workspace-a.md' }])
    await flush

    expect(applyChanges).not.toHaveBeenCalled()
    expect(rebuildAll).not.toHaveBeenCalled()
    queue.dispose()
  })

  it('does not rebuild after opening finishes for a cleared queue generation', async () => {
    let finishOpen!: () => void
    const opening = new Promise<void>((resolve) => {
      finishOpen = resolve
    })
    const openIndex = vi.fn(() => opening)
    const rebuildAll = vi.fn(async () => undefined)
    const queue = new WorkspaceSearchIndexUpdateQueue<SearchDocument>({
      applyChanges: vi.fn(async () => undefined),
      delayMs: 100,
      getDocumentPath: (document) => document.path,
      loadDocuments: vi.fn(async () => []),
      logger: createLogger(),
      openIndex,
      rebuildAll,
      runTask: (work) => work(),
    })

    queue.scheduleFullRebuild()
    const flush = queue.flushPending()
    await vi.waitFor(() => expect(openIndex).toHaveBeenCalledOnce())

    queue.clear()
    finishOpen()
    await flush

    expect(rebuildAll).not.toHaveBeenCalled()
    queue.dispose()
  })
})
