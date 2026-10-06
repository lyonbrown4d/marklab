import type { LifecyclePhase, LifecycleTask } from '@electron/main/lifecycle/types'
import type { Logger } from '@electron/services/logger'

type LifecycleCoordinatorOptions = {
  logger: Logger
  tasks: readonly LifecycleTask[]
}

const phaseOrder: Record<LifecyclePhase, number> = {
  infrastructure: 0,
  services: 1,
  runtime: 2,
}

export class LifecycleStartupError extends Error {
  readonly taskName: string

  constructor(taskName: string, cause: unknown) {
    super(`Critical startup task failed: ${taskName}`, { cause })
    this.name = 'LifecycleStartupError'
    this.taskName = taskName
  }
}

export class LifecycleCoordinator {
  private readonly logger: Logger
  private readonly tasks: readonly LifecycleTask[]
  private readonly startedTasks: LifecycleTask[] = []
  private startupPromise: Promise<void> | null = null
  private shutdownPromise: Promise<void> | null = null
  private state: 'idle' | 'starting' | 'started' | 'stopping' | 'stopped' | 'failed' = 'idle'

  constructor(options: LifecycleCoordinatorOptions) {
    this.logger = options.logger.child('lifecycle')
    this.tasks = orderTasks(options.tasks)
  }

  startup(): Promise<void> {
    if (this.state === 'started') return Promise.resolve()
    if (this.startupPromise) return this.startupPromise
    if (this.state !== 'idle') {
      return Promise.reject(new Error(`Lifecycle startup is unavailable while ${this.state}`))
    }

    this.state = 'starting'
    this.startupPromise = this.runStartup().finally(() => {
      this.startupPromise = null
    })
    return this.startupPromise
  }

  shutdown(): Promise<void> {
    if (this.state === 'stopped') return Promise.resolve()
    if (this.shutdownPromise) return this.shutdownPromise

    this.shutdownPromise = this.runShutdown().finally(() => {
      this.shutdownPromise = null
    })
    return this.shutdownPromise
  }

  private readonly runStartup = async (): Promise<void> => {
    const failedTasks = new Set<string>()
    for (const task of this.tasks) {
      const failedDependency = task.dependencies.find((name) => failedTasks.has(name))
      if (failedDependency) {
        const error = new Error(`Dependency ${failedDependency} did not start`)
        if (task.critical) await this.failStartup(task, error)
        failedTasks.add(task.name)
        this.logger.warn('non-critical startup task skipped', {
          dependency: failedDependency,
          task: task.name,
        })
        continue
      }

      const startedAt = performance.now()
      try {
        await task.start()
        this.startedTasks.push(task)
        this.logger.info('startup task finished', {
          durationMs: elapsedMilliseconds(startedAt),
          phase: task.phase,
          task: task.name,
        })
      } catch (error) {
        this.logger.error('startup task failed', {
          critical: task.critical,
          durationMs: elapsedMilliseconds(startedAt),
          error,
          phase: task.phase,
          task: task.name,
        })
        if (task.critical) await this.failStartup(task, error)
        failedTasks.add(task.name)
      }
    }
    this.state = 'started'
  }

  private readonly failStartup = async (task: LifecycleTask, cause: unknown): Promise<never> => {
    this.state = 'failed'
    await this.stopStartedTasks()
    throw new LifecycleStartupError(task.name, cause)
  }

  private readonly runShutdown = async (): Promise<void> => {
    if (this.startupPromise) {
      try {
        await this.startupPromise
      } catch {
        // A failed startup already rolls back every task that reached the started state.
      }
    }
    if (this.startedTasks.length === 0) {
      this.state = 'stopped'
      return
    }

    this.state = 'stopping'
    const failures = await this.stopStartedTasks()
    if (failures.length > 0) {
      this.state = 'failed'
      throw new AggregateError(failures, 'One or more lifecycle tasks failed to stop')
    }
    this.state = 'stopped'
  }

  private readonly stopStartedTasks = async (): Promise<unknown[]> => {
    const failures: unknown[] = []
    for (const task of [...this.startedTasks].reverse()) {
      if (!task.stop) {
        this.removeStartedTask(task)
        continue
      }
      const startedAt = performance.now()
      try {
        await task.stop()
        this.removeStartedTask(task)
        this.logger.info('shutdown task finished', {
          durationMs: elapsedMilliseconds(startedAt),
          phase: task.phase,
          task: task.name,
        })
      } catch (error) {
        failures.push(error)
        this.logger.error('shutdown task failed', {
          durationMs: elapsedMilliseconds(startedAt),
          error,
          phase: task.phase,
          task: task.name,
        })
      }
    }
    return failures
  }

  private readonly removeStartedTask = (task: LifecycleTask): void => {
    const index = this.startedTasks.indexOf(task)
    if (index >= 0) this.startedTasks.splice(index, 1)
  }
}

const elapsedMilliseconds = (startedAt: number): number =>
  Math.round((performance.now() - startedAt) * 100) / 100

const orderTasks = (tasks: readonly LifecycleTask[]): readonly LifecycleTask[] => {
  const tasksByName = new Map<string, LifecycleTask>()
  for (const task of tasks) {
    if (tasksByName.has(task.name)) throw new Error(`Duplicate lifecycle task: ${task.name}`)
    tasksByName.set(task.name, task)
  }
  for (const task of tasks) {
    for (const dependency of task.dependencies) {
      if (!tasksByName.has(dependency)) {
        throw new Error(`Unknown lifecycle dependency ${dependency} for ${task.name}`)
      }
    }
  }

  const remaining = new Set(tasks)
  const ordered: LifecycleTask[] = []
  while (remaining.size > 0) {
    const ready = Array.from(remaining)
      .filter((task) =>
        task.dependencies.every((name) => ordered.some((item) => item.name === name)),
      )
      .sort(compareTasks)
    const next = ready[0]
    if (!next) {
      throw new Error(
        `Cyclic lifecycle task dependencies: ${Array.from(remaining, (task) => task.name).join(', ')}`,
      )
    }
    remaining.delete(next)
    ordered.push(next)
  }
  return ordered
}

const compareTasks = (left: LifecycleTask, right: LifecycleTask): number =>
  phaseOrder[left.phase] - phaseOrder[right.phase] ||
  left.order - right.order ||
  left.name.localeCompare(right.name)
