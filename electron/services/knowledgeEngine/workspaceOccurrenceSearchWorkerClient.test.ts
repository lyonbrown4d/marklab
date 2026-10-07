import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { WorkspaceOccurrenceSearchWorkerClient } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearchWorkerClient'

class WorkerFake extends EventEmitter {
  postMessage = vi.fn()
  terminate = vi.fn(async () => 0)
}

const emitSuccess = (worker: WorkerFake, message: unknown) => {
  worker.emit('message', message)
}

const input = {
  caseSensitive: false,
  limit: 20,
  query: '(a+)+$',
  useRegex: true,
  wholeWord: false,
}

describe('WorkspaceOccurrenceSearchWorkerClient', () => {
  it('hard-terminates a timed-out regex worker', async () => {
    const worker = new WorkerFake()
    const client = new WorkspaceOccurrenceSearchWorkerClient({
      createWorker: () => worker,
      timeoutMs: 10,
    })

    await expect(
      client.run(
        {
          documents: [{ path: 'one.md', title: 'One', content: `${'a'.repeat(100)}!` }],
          revision: 'revision-1',
        },
        input,
      ),
    ).rejects.toThrow(/timed out/i)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('hard-terminates the worker when the caller cancels', async () => {
    const worker = new WorkerFake()
    const client = new WorkspaceOccurrenceSearchWorkerClient({ createWorker: () => worker })
    const controller = new AbortController()

    const operation = client.run(
      { documents: [], revision: 'revision-1' },
      input,
      controller.signal,
    )
    controller.abort()

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('starts the next job before an aborted worker finishes terminating', async () => {
    const firstWorker = new WorkerFake()
    const secondWorker = new WorkerFake()
    let finishTermination!: (code: number) => void
    firstWorker.terminate.mockImplementation(
      () =>
        new Promise<number>((resolve) => {
          finishTermination = resolve
        }),
    )
    const createWorker = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValueOnce(secondWorker)
    const client = new WorkspaceOccurrenceSearchWorkerClient({ createWorker })
    const controller = new AbortController()
    const first = client.run({ documents: [], revision: 'revision-1' }, input, controller.signal)
    const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' })
    const second = client.run({ documents: [], revision: 'revision-2' }, input)

    controller.abort()
    await vi.waitFor(() =>
      expect(secondWorker.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'sync', revision: 'revision-2' }),
      ),
    )
    emitSuccess(secondWorker, { type: 'synced', id: 2, ok: true, revision: 'revision-2' })
    await vi.waitFor(() => expect(secondWorker.postMessage).toHaveBeenCalledTimes(2))
    emitSuccess(secondWorker, {
      type: 'result',
      id: 3,
      ok: true,
      revision: 'revision-2',
      result: { results: [], totalHits: 0 },
    })
    firstWorker.emit('exit', 1)
    finishTermination(0)

    await firstRejected
    await expect(second).resolves.toEqual({ results: [], totalHits: 0 })
    await client.dispose()
  })

  it('reuses one worker and only synchronizes documents when the revision changes', async () => {
    const worker = new WorkerFake()
    const createWorker = vi.fn(() => worker)
    const client = new WorkspaceOccurrenceSearchWorkerClient({ createWorker })
    const documents = [{ path: 'one.md', title: 'One', content: 'needle' }]

    const first = client.run({ documents, revision: 'revision-1' }, input)
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: 'sync',
      id: 1,
      revision: 'revision-1',
      documents,
    })
    emitSuccess(worker, { type: 'synced', id: 1, ok: true, revision: 'revision-1' })
    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenLastCalledWith({
        type: 'search',
        id: 2,
        revision: 'revision-1',
        input,
      }),
    )
    emitSuccess(worker, {
      type: 'result',
      id: 2,
      ok: true,
      revision: 'revision-1',
      result: { results: [], totalHits: 0 },
    })
    await first

    const second = client.run({ documents, revision: 'revision-1' }, input)
    await vi.waitFor(() =>
      expect(worker.postMessage).toHaveBeenLastCalledWith({
        type: 'search',
        id: 3,
        revision: 'revision-1',
        input,
      }),
    )
    emitSuccess(worker, {
      type: 'result',
      id: 3,
      ok: true,
      revision: 'revision-1',
      result: { results: [], totalHits: 0 },
    })
    await second

    expect(createWorker).toHaveBeenCalledOnce()
    expect(
      worker.postMessage.mock.calls.filter(([message]) => message.type === 'sync'),
    ).toHaveLength(1)
    expect(worker.terminate).not.toHaveBeenCalled()
    await client.dispose()
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('resynchronizes changed documents before searching the new revision', async () => {
    const worker = new WorkerFake()
    const client = new WorkspaceOccurrenceSearchWorkerClient({ createWorker: () => worker })
    const firstDocuments = [{ path: 'one.md', title: 'One', content: 'old' }]
    const nextDocuments = [{ path: 'one.md', title: 'One', content: 'new' }]

    const first = client.run({ documents: firstDocuments, revision: 'revision-1' }, input)
    emitSuccess(worker, { type: 'synced', id: 1, ok: true, revision: 'revision-1' })
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(2))
    emitSuccess(worker, {
      type: 'result',
      id: 2,
      ok: true,
      revision: 'revision-1',
      result: { results: [], totalHits: 0 },
    })
    await first

    const second = client.run({ documents: nextDocuments, revision: 'revision-2' }, input)
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      type: 'sync',
      id: 3,
      revision: 'revision-2',
      documents: nextDocuments,
    })
    emitSuccess(worker, { type: 'synced', id: 3, ok: true, revision: 'revision-2' })
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalledTimes(4))
    emitSuccess(worker, {
      type: 'result',
      id: 4,
      ok: true,
      revision: 'revision-2',
      result: { results: [], totalHits: 0 },
    })
    await second
  })

  it('bounds queued work while one persistent worker is busy', async () => {
    const worker = new WorkerFake()
    const client = new WorkspaceOccurrenceSearchWorkerClient({
      createWorker: () => worker,
      maxQueuedJobs: 1,
    })

    const first = client.run({ documents: [], revision: 'revision-1' }, input)
    const second = client.run({ documents: [], revision: 'revision-1' }, input)
    await expect(client.run({ documents: [], revision: 'revision-1' }, input)).rejects.toThrow(
      /queue is full/i,
    )

    const settled = Promise.allSettled([first, second])
    await client.dispose()
    await settled
  })

  it('replaces a persistent worker that exits while idle', async () => {
    const firstWorker = new WorkerFake()
    const secondWorker = new WorkerFake()
    const createWorker = vi.fn().mockReturnValueOnce(firstWorker).mockReturnValueOnce(secondWorker)
    const client = new WorkspaceOccurrenceSearchWorkerClient({ createWorker })

    const first = client.run({ documents: [], revision: 'revision-1' }, input)
    emitSuccess(firstWorker, { type: 'synced', id: 1, ok: true, revision: 'revision-1' })
    await vi.waitFor(() => expect(firstWorker.postMessage).toHaveBeenCalledTimes(2))
    emitSuccess(firstWorker, {
      type: 'result',
      id: 2,
      ok: true,
      revision: 'revision-1',
      result: { results: [], totalHits: 0 },
    })
    await first
    firstWorker.emit('exit', 1)

    const operation = client.run({ documents: [], revision: 'revision-1' }, input)
    expect(secondWorker.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'sync', revision: 'revision-1' }),
    )
    await client.dispose()
    await expect(operation).rejects.toThrow(/disposed/i)
  })
})
