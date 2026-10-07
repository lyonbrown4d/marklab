import { describe, expect, it, vi } from 'vitest'

import {
  PreviewCaptureQueue,
  PreviewCaptureQueueCancelledError,
  PreviewCaptureQueueFullError,
} from '@/components/previews/previewCaptureQueue'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}

describe('PreviewCaptureQueue', () => {
  it('bounds concurrent and pending captures', async () => {
    const queue = new PreviewCaptureQueue({
      backgroundConcurrency: 2,
      concurrency: 2,
      maxPending: 1,
    })
    const first = deferred<string>()
    const second = deferred<string>()
    const runFirst = vi.fn(() => first.promise)
    const runSecond = vi.fn(() => second.promise)
    const runThird = vi.fn(async () => 'third')
    const runOverflow = vi.fn(async () => 'overflow')

    const firstResult = queue.enqueue({ key: 'one', priority: 'background', run: runFirst })
    const secondResult = queue.enqueue({ key: 'two', priority: 'background', run: runSecond })
    const thirdResult = queue.enqueue({ key: 'three', priority: 'background', run: runThird })
    const overflow = queue.enqueue({ key: 'four', priority: 'background', run: runOverflow })

    expect(runFirst).toHaveBeenCalledOnce()
    expect(runSecond).toHaveBeenCalledOnce()
    expect(runThird).not.toHaveBeenCalled()
    await expect(overflow).rejects.toBeInstanceOf(PreviewCaptureQueueFullError)
    expect(runOverflow).not.toHaveBeenCalled()

    first.resolve('first')
    await expect(firstResult).resolves.toBe('first')
    await vi.waitFor(() => expect(runThird).toHaveBeenCalledOnce())
    second.resolve('second')
    await expect(secondResult).resolves.toBe('second')
    await expect(thirdResult).resolves.toBe('third')
  })

  it('reserves capacity so interactive work bypasses running background captures', async () => {
    const queue = new PreviewCaptureQueue({ concurrency: 2, maxPending: 2 })
    const background = deferred<void>()
    const runSecondBackground = vi.fn(async () => undefined)
    const runInteractive = vi.fn(async () => 'interactive')

    const first = queue.enqueue({
      key: 'background-one',
      priority: 'background',
      run: () => background.promise,
    })
    const second = queue.enqueue({
      key: 'background-two',
      priority: 'background',
      run: runSecondBackground,
    })
    const interactive = queue.enqueue({
      key: 'interactive',
      priority: 'interactive',
      run: runInteractive,
    })

    expect(runSecondBackground).not.toHaveBeenCalled()
    await expect(interactive).resolves.toBe('interactive')
    expect(runInteractive).toHaveBeenCalledOnce()
    background.resolve()
    await first
    await second
  })

  it('keeps a shared pending capture while another subscriber still needs it', async () => {
    const queue = new PreviewCaptureQueue({ concurrency: 1, maxPending: 2 })
    const running = deferred<void>()
    const first = queue.enqueue({
      key: 'running',
      priority: 'interactive',
      run: () => running.promise,
    })
    const firstController = new AbortController()
    const secondController = new AbortController()
    const runShared = vi.fn(async () => 'shared')
    const firstShared = queue.enqueue({
      key: 'shared',
      priority: 'background',
      run: runShared,
      signal: firstController.signal,
    })
    const secondShared = queue.enqueue({
      key: 'shared',
      priority: 'background',
      run: runShared,
      signal: secondController.signal,
    })

    firstController.abort()
    await expect(firstShared).rejects.toBeInstanceOf(PreviewCaptureQueueCancelledError)
    expect(runShared).not.toHaveBeenCalled()
    running.resolve()
    await first
    await expect(secondShared).resolves.toBe('shared')
    expect(runShared).toHaveBeenCalledOnce()
  })

  it('allows the same key to enqueue again from a settlement callback', async () => {
    const queue = new PreviewCaptureQueue({ concurrency: 1, maxPending: 1 })
    const runFirst = vi.fn(async () => 'first')
    const runSecond = vi.fn(async () => 'second')

    const second = queue
      .enqueue({ key: 'repeat', priority: 'interactive', run: runFirst })
      .then(() => queue.enqueue({ key: 'repeat', priority: 'interactive', run: runSecond }))

    await expect(second).resolves.toBe('second')
    expect(runFirst).toHaveBeenCalledOnce()
    expect(runSecond).toHaveBeenCalledOnce()
  })

  it('promotes an existing hover task ahead of background work', async () => {
    const queue = new PreviewCaptureQueue({ concurrency: 1, maxPending: 3 })
    const running = deferred<void>()
    const order: string[] = []
    const first = queue.enqueue({
      key: 'running',
      priority: 'background',
      run: () => running.promise,
    })
    const background = queue.enqueue({
      key: 'background',
      priority: 'background',
      run: async () => void order.push('background'),
    })
    const hovered = queue.enqueue({
      key: 'hovered',
      priority: 'background',
      run: async () => void order.push('hovered'),
    })

    queue.promote('hovered')
    running.resolve()
    await first
    await Promise.all([background, hovered])

    expect(order).toEqual(['hovered', 'background'])
  })

  it('admits interactive work by evicting a queued background capture', async () => {
    const queue = new PreviewCaptureQueue({ concurrency: 1, maxPending: 1 })
    const running = deferred<void>()
    const first = queue.enqueue({
      key: 'running',
      priority: 'background',
      run: () => running.promise,
    })
    const evicted = queue.enqueue({
      key: 'background',
      priority: 'background',
      run: async () => 'background',
    })
    const interactive = queue.enqueue({
      key: 'interactive',
      priority: 'interactive',
      run: async () => 'interactive',
    })

    await expect(evicted).rejects.toBeInstanceOf(PreviewCaptureQueueCancelledError)
    running.resolve()
    await first
    await expect(interactive).resolves.toBe('interactive')
  })

  it('bounds pending interactive captures when there is no background work to evict', async () => {
    const queue = new PreviewCaptureQueue({ concurrency: 1, maxPending: 1 })
    const running = deferred<void>()
    const first = queue.enqueue({
      key: 'running',
      priority: 'interactive',
      run: () => running.promise,
    })
    const pending = queue.enqueue({
      key: 'pending',
      priority: 'interactive',
      run: async () => 'pending',
    })
    const overflow = queue.enqueue({
      key: 'overflow',
      priority: 'interactive',
      run: async () => 'overflow',
    })

    await expect(overflow).rejects.toBeInstanceOf(PreviewCaptureQueueFullError)
    running.resolve()
    await first
    await expect(pending).resolves.toBe('pending')
  })

  it('cancels an offscreen capture before it starts', async () => {
    const queue = new PreviewCaptureQueue({ concurrency: 1, maxPending: 2 })
    const running = deferred<void>()
    const first = queue.enqueue({
      key: 'running',
      priority: 'background',
      run: () => running.promise,
    })
    const runOffscreen = vi.fn(async () => undefined)
    const offscreen = queue.enqueue({
      key: 'offscreen',
      priority: 'background',
      run: runOffscreen,
    })

    queue.cancel('offscreen')
    await expect(offscreen).rejects.toBeInstanceOf(PreviewCaptureQueueCancelledError)
    expect(runOffscreen).not.toHaveBeenCalled()
    running.resolve()
    await first
  })

  it('releases capacity after failure and permits a retry', async () => {
    const queue = new PreviewCaptureQueue({ concurrency: 1, maxPending: 1 })

    await expect(
      queue.enqueue({
        key: 'retryable',
        priority: 'background',
        run: async () => Promise.reject(new Error('capture failed')),
      }),
    ).rejects.toThrow('capture failed')

    await expect(
      queue.enqueue({
        key: 'retryable',
        priority: 'interactive',
        run: async () => 'recovered',
      }),
    ).resolves.toBe('recovered')
  })
})
