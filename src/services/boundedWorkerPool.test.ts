import { describe, expect, it, vi } from 'vitest'
import { BoundedWorkerPool, type ReusableWorker } from '@/services/boundedWorkerPool'

const createWorkerFactory = () => {
  const workers: ReusableWorker[] = []
  const createWorker = vi.fn(() => {
    const worker: ReusableWorker = {
      onerror: null,
      onmessage: null,
      terminate: vi.fn(),
    }
    workers.push(worker)
    return worker
  })
  return { createWorker, workers }
}

describe('BoundedWorkerPool', () => {
  it('queues acquisition after reaching the worker limit', async () => {
    const { createWorker, workers } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 3)
    const first = await pool.acquire()
    await pool.acquire()
    await pool.acquire()
    let fourth: ReusableWorker | undefined

    const waiting = Promise.resolve(pool.acquire()).then((worker) => (fourth = worker))
    await Promise.resolve()

    expect(workers).toHaveLength(3)
    expect(fourth).toBeUndefined()
    pool.release(first, true)
    await waiting
    expect(fourth).toBe(first)
  })

  it('preloads reusable workers incrementally up to the configured limit', async () => {
    const { createWorker, workers } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 3)

    pool.preload(1)
    expect(workers).toHaveLength(1)
    pool.preload(2)
    expect(workers).toHaveLength(2)
    pool.preload(3)

    expect(workers).toHaveLength(3)
    await pool.acquire()
    await pool.acquire()
    await pool.acquire()
    expect(createWorker).toHaveBeenCalledTimes(3)
  })

  it('removes an aborted acquisition from the wait queue', async () => {
    const { createWorker } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 1)
    const active = await pool.acquire()
    const controller = new AbortController()

    const waiting = pool.acquire(controller.signal)
    controller.abort()

    await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
    pool.release(active, true)
    await expect(Promise.resolve(pool.acquire())).resolves.toBe(active)
  })

  it('rejects queued work and disposes active workers released after termination', async () => {
    const { createWorker } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 1)
    const active = await pool.acquire()
    const waiting = pool.acquire()
    const error = new Error('Window closed')

    pool.terminate(error)
    await expect(waiting).rejects.toBe(error)
    pool.release(active, true)

    expect(active.terminate).toHaveBeenCalledOnce()
    await expect(Promise.resolve(pool.acquire())).rejects.toBe(error)
  })
})
