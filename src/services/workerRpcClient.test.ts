import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkerRpcClient } from '@/services/workerRpcClient'
import { createComlinkTestWorker } from '@/test/comlinkTestWorker'

type Api = { echo: (value: string) => Promise<string> | string }
const clients: WorkerRpcClient<Api>[] = []

describe('stateless RPC worker idle release', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    clients.splice(0).forEach((client) => client.terminate())
    vi.useRealTimers()
  })

  it('reuses warm workers, releases their heaps after inactivity, and recreates on demand', async () => {
    const first = createComlinkTestWorker({ echo: (value: string) => value })
    const second = createComlinkTestWorker({ echo: (value: string) => value })
    const workers = [first.worker, second.worker]
    const factory = vi.fn(() => workers.shift()!)
    const client = new WorkerRpcClient<Api>(factory, 'Test')
    clients.push(client)

    await expect(client.call((remote) => remote.echo('first'))).resolves.toBe('first')
    await vi.advanceTimersByTimeAsync(29_999)
    await expect(client.call((remote) => remote.echo('warm'))).resolves.toBe('warm')
    expect(factory).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(29_999)
    expect(first.worker.terminate).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(first.worker.terminate).toHaveBeenCalledOnce()
    expect(first.listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    await expect(client.call((remote) => remote.echo('reopened'))).resolves.toBe('reopened')
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('never releases a busy worker even when a concurrent peer finishes', async () => {
    let finish: ((value: string) => void) | undefined
    const pending = new Promise<string>((resolve) => {
      finish = resolve
    })
    const { worker } = createComlinkTestWorker({
      echo: (value: string) => (value === 'hold' ? pending : value),
    })
    const client = new WorkerRpcClient<Api>(() => worker, 'Test')
    clients.push(client)
    await client.call((remote) => remote.echo('ready'))
    await vi.advanceTimersByTimeAsync(29_999)
    const held = client.call((remote) => remote.echo('hold'))
    await client.call((remote) => remote.echo('peer'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(worker.terminate).not.toHaveBeenCalled()
    finish?.('complete')
    await expect(held).resolves.toBe('complete')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('releases idle workers after domain errors and clears cleanup on explicit termination', async () => {
    const { worker, listeners } = createComlinkTestWorker({
      echo: () => {
        throw new Error('invalid input')
      },
    })
    const client = new WorkerRpcClient<Api>(() => worker, 'Test')
    clients.push(client)
    await expect(client.call((remote) => remote.echo('bad'))).rejects.toThrow('invalid input')
    expect(vi.getTimerCount()).toBe(1)
    client.terminate()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(listeners.size).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
