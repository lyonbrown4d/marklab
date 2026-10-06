import {
  distinctUntilChanged,
  map,
  Subject,
  type Subscription,
  switchMap,
  takeUntil,
  tap,
  timer,
} from 'rxjs'

import type { GraphLayoutSave } from '@/services/graphLayoutApi'

type SaveCommand = {
  retryGeneration: number
  value: GraphLayoutSave
}

type Options = {
  delayMs: number
  onError: (error: unknown) => void
  save: (value: GraphLayoutSave) => Promise<void>
}

export class WorkspaceMapLayoutSaveQueue {
  private readonly cancelScheduled = new Subject<void>()
  private readonly options: Options
  private readonly requests = new Subject<SaveCommand>()
  private readonly subscription: Subscription
  private lastSaved: GraphLayoutSave | null = null
  private pending: SaveCommand | null = null
  private retryGeneration = 0
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(options: Options) {
    this.options = options
    this.subscription = this.requests
      .pipe(
        distinctUntilChanged(
          (previous, current) =>
            previous.retryGeneration === current.retryGeneration &&
            areLayoutSavesEqual(previous.value, current.value),
        ),
        tap((command) => {
          this.pending = command
        }),
        switchMap((command) =>
          timer(this.options.delayMs).pipe(
            takeUntil(this.cancelScheduled),
            map(() => command),
          ),
        ),
      )
      .subscribe((command) => {
        if (this.pending === command) this.pending = null
        void this.enqueue(command).catch(this.options.onError)
      })
  }

  dispose(): void {
    this.subscription.unsubscribe()
    this.requests.complete()
    this.cancelScheduled.complete()
  }

  async flushPending(): Promise<void> {
    this.cancelScheduled.next()
    const command = this.pending
    this.pending = null
    if (command) return this.enqueue(command)
    await this.saveQueue
  }

  schedule(value: GraphLayoutSave): void {
    this.requests.next({ retryGeneration: this.retryGeneration, value })
  }

  private enqueue(command: SaveCommand): Promise<void> {
    const operation = this.saveQueue.then(async () => {
      if (this.lastSaved && areLayoutSavesEqual(this.lastSaved, command.value)) return
      try {
        await this.options.save(command.value)
        this.lastSaved = command.value
      } catch (error) {
        this.retryGeneration += 1
        throw error
      }
    })
    this.saveQueue = operation.catch(() => undefined)
    return operation
  }
}

const areLayoutSavesEqual = (left: GraphLayoutSave, right: GraphLayoutSave): boolean => {
  if (
    left.engineVersion !== right.engineVersion ||
    left.graphRevision !== right.graphRevision ||
    left.layoutKey !== right.layoutKey ||
    left.mode !== right.mode ||
    left.nodes.length !== right.nodes.length ||
    !areViewportsEqual(left.viewport, right.viewport)
  ) {
    return false
  }
  return left.nodes.every((node, index) => {
    const other = right.nodes[index]
    return (
      other !== undefined &&
      node.id === other.id &&
      node.x === other.x &&
      node.y === other.y &&
      node.width === other.width &&
      node.height === other.height &&
      node.collapsed === other.collapsed &&
      node.pinned === other.pinned &&
      node.userModified === other.userModified
    )
  })
}

const areViewportsEqual = (
  left: GraphLayoutSave['viewport'],
  right: GraphLayoutSave['viewport'],
): boolean =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.x === right.x &&
    left.y === right.y &&
    left.zoom === right.zoom)
