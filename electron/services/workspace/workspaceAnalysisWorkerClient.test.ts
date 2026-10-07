import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceAnalysisWorkerClient } from '@electron/services/workspace/workspaceAnalysisWorkerClient'

type WorkerFake = {
  emit: (event: string, value: unknown) => boolean
  postMessage: ReturnType<typeof vi.fn>
  terminate: ReturnType<typeof vi.fn>
}
const workers = vi.hoisted(() => [] as WorkerFake[])

vi.mock('node:worker_threads', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:worker_threads')>()
  const { EventEmitter } = await import('node:events')
  class Worker extends EventEmitter {
    postMessage = vi.fn()
    terminate = vi.fn(async () => 0)

    constructor() {
      super()
      workers.push(this as WorkerFake)
    }
  }
  return {
    ...actual,
    default: { ...actual, Worker },
    Worker,
  }
})

describe('WorkspaceAnalysisWorkerClient latest tasks', () => {
  beforeEach(() => workers.splice(0))

  it('bounds latest-wins work and ignores delayed exit from the replaced worker', async () => {
    const client = new WorkspaceAnalysisWorkerClient({ warn: vi.fn() } as never)
    const task = {
      type: 'workspace-index' as const,
      documents: [],
      knownPaths: { paths: [], assetPaths: [] },
    }
    const first = client.runLatest(task)
    const firstRejected = expect(first).rejects.toThrow(/terminated/i)
    const second = client.runLatest(task)
    const firstWorker = workers[0]!
    const secondWorker = workers[1]!

    firstWorker.emit('exit', 1)
    secondWorker.emit('message', {
      id: 2,
      ok: true,
      payload: { files: [], paths: [], asset_paths: [] },
    })

    await firstRejected
    await expect(second).resolves.toEqual({ files: [], paths: [], asset_paths: [] })
    expect(firstWorker.terminate).toHaveBeenCalledOnce()
    expect(workers).toHaveLength(2)
    client.terminate()
  })
})
