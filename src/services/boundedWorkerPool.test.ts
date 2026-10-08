import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.useRealTimers()
  })

  it('scales from one preloaded worker to three active workers on demand', async () => {
    const { createWorker, workers } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 3, 60_000)
    pool.preload(1)
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

  it('reclaims preloaded idle workers after the configured TTL and recreates on demand', async () => {
    vi.useFakeTimers()
    const { createWorker, workers } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 3, 1_000)

    pool.preload(1)
    pool.preload(2)
    pool.preload(3)

    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(workers.every((worker) => vi.mocked(worker.terminate).mock.calls.length === 0)).toBe(
      true,
    )

    await vi.advanceTimersByTimeAsync(1)
    expect(workers.every((worker) => vi.mocked(worker.terminate).mock.calls.length === 1)).toBe(
      true,
    )
    expect(vi.getTimerCount()).toBe(0)

    await pool.acquire()
    expect(createWorker).toHaveBeenCalledTimes(4)
  })

  it('keeps active workers until release and starts their idle TTL on release', async () => {
    vi.useFakeTimers()
    const { createWorker } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 1, 1_000)
    pool.preload(1)
    const active = await pool.acquire()

    await vi.advanceTimersByTimeAsync(1_000)
    expect(active.terminate).not.toHaveBeenCalled()

    pool.release(active, true)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(active.terminate).toHaveBeenCalledOnce()
  })

  it('expires staggered idle workers at their own deadlines with one timer', async () => {
    vi.useFakeTimers()
    const { createWorker } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 2, 1_000)
    const first = await pool.acquire()
    const second = await pool.acquire()

    pool.release(first, true)
    await vi.advanceTimersByTimeAsync(500)
    pool.release(second, true)

    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(first.terminate).toHaveBeenCalledOnce()
    expect(second.terminate).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(500)
    expect(second.terminate).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reclaims workers created before a later preload construction failure', async () => {
    vi.useFakeTimers()
    const worker: ReusableWorker = {
      onerror: null,
      onmessage: null,
      terminate: vi.fn(),
    }
    const createWorker = vi
      .fn<() => ReusableWorker>()
      .mockReturnValueOnce(worker)
      .mockImplementation(() => {
        throw new Error('Worker construction failed')
      })
    const pool = new BoundedWorkerPool(createWorker, 2, 1_000)

    expect(() => pool.preload(2)).toThrow('Worker construction failed')
    expect(vi.getTimerCount()).toBe(1)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(worker.terminate).toHaveBeenCalledOnce()
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

  it('clears idle cleanup and disposes active workers released after termination', async () => {
    vi.useFakeTimers()
    const { createWorker } = createWorkerFactory()
    const pool = new BoundedWorkerPool(createWorker, 2, 1_000)
    pool.preload(2)
    const active = await pool.acquire()
    const error = new Error('Window closed')

    expect(vi.getTimerCount()).toBe(1)
    pool.terminate(error)
    expect(vi.getTimerCount()).toBe(0)
    pool.release(active, true)

    expect(active.terminate).toHaveBeenCalledOnce()
    await expect(Promise.resolve(pool.acquire())).rejects.toBe(error)
  })
})
