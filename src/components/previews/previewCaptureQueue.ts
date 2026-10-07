import PQueue from 'p-queue'

export type PreviewCapturePriority = 'background' | 'interactive'

type PreviewCaptureQueueOptions = {
  backgroundConcurrency?: number
  concurrency?: number
  maxPending?: number
}

type EnqueueOptions<T> = {
  key: string
  priority: PreviewCapturePriority
  run: () => Promise<T> | T
  signal?: AbortSignal
}

type QueueSubscriber = {
  abort?: () => void
  reject: (reason: unknown) => void
  resolve: (value: unknown) => void
  signal?: AbortSignal
}

type QueueTask = {
  controller?: AbortController
  generation: number
  id: string
  key: string
  priority: PreviewCapturePriority
  run: () => Promise<unknown> | unknown
  sequence: number
  state: 'pending' | 'running'
  subscribers: Set<QueueSubscriber>
}

const BACKGROUND_QUEUE_PRIORITY = 0
const INTERACTIVE_QUEUE_PRIORITY = 1
const DEFAULT_CONCURRENCY = 2
const DEFAULT_MAX_PENDING = 8

export class PreviewCaptureQueueFullError extends Error {
  constructor() {
    super('Web preview capture queue is full')
    this.name = 'PreviewCaptureQueueFullError'
  }
}

export class PreviewCaptureQueueCancelledError extends Error {
  constructor() {
    super('Web preview capture was cancelled before starting')
    this.name = 'PreviewCaptureQueueCancelledError'
  }
}

export class PreviewCaptureQueue {
  private readonly backgroundQueue: PQueue
  private readonly executionQueue: PQueue
  private readonly maxPending: number
  private nextSequence = 1
  private readonly tasks = new Map<string, QueueTask>()

  constructor(options: PreviewCaptureQueueOptions = {}) {
    const concurrency = positiveInteger(options.concurrency, DEFAULT_CONCURRENCY)
    const backgroundConcurrency = Math.min(
      concurrency,
      positiveInteger(options.backgroundConcurrency, Math.max(1, concurrency - 1)),
    )
    this.executionQueue = new PQueue({ concurrency })
    this.backgroundQueue = new PQueue({ concurrency: backgroundConcurrency })
    this.maxPending = positiveInteger(options.maxPending, DEFAULT_MAX_PENDING)
  }

  enqueue<T>({ key, priority, run, signal }: EnqueueOptions<T>): Promise<T> {
    if (signal?.aborted) return Promise.reject(new PreviewCaptureQueueCancelledError())
    const existing = this.tasks.get(key)
    if (existing) {
      if (priority === 'interactive') this.promote(key)
      return this.subscribe<T>(existing, signal)
    }
    if (this.pendingCount() >= this.maxPending) {
      if (priority === 'background') return Promise.reject(new PreviewCaptureQueueFullError())
      const evicted = this.latestPendingBackground()
      if (!evicted) return Promise.reject(new PreviewCaptureQueueFullError())
      this.cancelPending(evicted, new PreviewCaptureQueueCancelledError())
    }

    const sequence = this.nextSequence++
    const task: QueueTask = {
      generation: 0,
      id: `capture-${sequence}`,
      key,
      priority,
      run,
      sequence,
      state: 'pending',
      subscribers: new Set(),
    }
    this.tasks.set(key, task)
    const promise = this.subscribe<T>(task, signal)
    this.schedule(task)
    return promise
  }

  promote(key: string): void {
    const task = this.tasks.get(key)
    if (!task || task.state !== 'pending' || task.priority === 'interactive') return
    task.priority = 'interactive'
    task.controller?.abort(new PreviewCaptureQueueCancelledError())
    this.schedule(task)
  }

  cancel(key: string): void {
    const task = this.tasks.get(key)
    if (!task) return
    this.rejectSubscribers(task, new PreviewCaptureQueueCancelledError())
    if (task.state === 'pending') this.cancelPending(task, new PreviewCaptureQueueCancelledError())
  }

  private schedule(task: QueueTask): void {
    const controller = new AbortController()
    const generation = ++task.generation
    task.controller = controller
    const options = {
      id: task.id,
      priority:
        task.priority === 'interactive' ? INTERACTIVE_QUEUE_PRIORITY : BACKGROUND_QUEUE_PRIORITY,
      signal: controller.signal,
    }
    const scheduled =
      task.priority === 'background'
        ? this.backgroundQueue.add(
            () => this.executionQueue.add(() => this.execute(task, generation), options),
            options,
          )
        : this.executionQueue.add(() => this.execute(task, generation), options)
    void scheduled.catch((error: unknown) => this.rejectSchedulingFailure(task, generation, error))
  }

  private async execute(task: QueueTask, generation: number): Promise<void> {
    if (this.tasks.get(task.key) !== task || task.generation !== generation) return
    task.state = 'running'
    try {
      const value = await task.run()
      this.finish(task, () => this.resolveSubscribers(task, value))
    } catch (error) {
      this.finish(task, () => this.rejectSubscribers(task, error))
    }
  }

  private finish(task: QueueTask, settle: () => void): void {
    if (this.tasks.get(task.key) === task) this.tasks.delete(task.key)
    settle()
  }

  private rejectSchedulingFailure(task: QueueTask, generation: number, error: unknown): void {
    if (
      this.tasks.get(task.key) !== task ||
      task.generation !== generation ||
      task.state !== 'pending'
    ) {
      return
    }
    this.tasks.delete(task.key)
    this.rejectSubscribers(task, error)
  }

  private pendingCount(): number {
    let count = 0
    for (const task of this.tasks.values()) {
      if (task.state === 'pending') count += 1
    }
    return count
  }

  private latestPendingBackground(): QueueTask | undefined {
    let latest: QueueTask | undefined
    for (const task of this.tasks.values()) {
      if (
        task.state === 'pending' &&
        task.priority === 'background' &&
        (!latest || task.sequence > latest.sequence)
      ) {
        latest = task
      }
    }
    return latest
  }

  private cancelPending(task: QueueTask, error: Error): void {
    if (this.tasks.get(task.key) === task) this.tasks.delete(task.key)
    task.controller?.abort(error)
    this.rejectSubscribers(task, error)
  }

  private subscribe<T>(task: QueueTask, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const subscriber: QueueSubscriber = {
        reject,
        resolve: (value) => resolve(value as T),
        signal,
      }
      if (signal) {
        subscriber.abort = () => this.unsubscribe(task, subscriber)
        signal.addEventListener('abort', subscriber.abort, { once: true })
      }
      task.subscribers.add(subscriber)
    })
  }

  private unsubscribe(task: QueueTask, subscriber: QueueSubscriber): void {
    if (!task.subscribers.delete(subscriber)) return
    this.detachSubscriber(subscriber)
    subscriber.reject(new PreviewCaptureQueueCancelledError())
    if (task.subscribers.size === 0 && task.state === 'pending') {
      this.cancelPending(task, new PreviewCaptureQueueCancelledError())
    }
  }

  private resolveSubscribers(task: QueueTask, value: unknown): void {
    for (const subscriber of task.subscribers) {
      this.detachSubscriber(subscriber)
      subscriber.resolve(value)
    }
    task.subscribers.clear()
  }

  private rejectSubscribers(task: QueueTask, reason: unknown): void {
    for (const subscriber of task.subscribers) {
      this.detachSubscriber(subscriber)
      subscriber.reject(reason)
    }
    task.subscribers.clear()
  }

  private detachSubscriber(subscriber: QueueSubscriber): void {
    if (subscriber.abort) subscriber.signal?.removeEventListener('abort', subscriber.abort)
  }
}

const positiveInteger = (value: number | undefined, fallback: number) =>
  Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback

export const previewCaptureQueue = new PreviewCaptureQueue()
