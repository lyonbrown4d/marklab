import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { WorkspaceOccurrenceSearchWorkerClient } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearchWorkerClient'

class WorkerFake extends EventEmitter {
  postMessage = vi.fn()
  terminate = vi.fn(async () => 0)
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
      client.run([{ path: 'one.md', title: 'One', content: `${'a'.repeat(100)}!` }], input),
    ).rejects.toThrow(/timed out/i)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('hard-terminates the worker when the caller cancels', async () => {
    const worker = new WorkerFake()
    const client = new WorkspaceOccurrenceSearchWorkerClient({ createWorker: () => worker })
    const controller = new AbortController()

    const operation = client.run([], input, controller.signal)
    controller.abort()

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
