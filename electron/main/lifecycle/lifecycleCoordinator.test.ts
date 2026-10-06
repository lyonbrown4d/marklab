import { describe, expect, it, vi } from 'vitest'

import {
  LifecycleCoordinator,
  LifecycleStartupError,
} from '@electron/main/lifecycle/lifecycleCoordinator'
import type { LifecycleTask } from '@electron/main/lifecycle/types'
import { noopLogger } from '@electron/services/logger'

const task = (
  name: string,
  options: Partial<LifecycleTask> & Pick<LifecycleTask, 'start'>,
): LifecycleTask => ({
  critical: true,
  dependencies: [],
  name,
  order: 0,
  phase: 'services',
  ...options,
})

describe('LifecycleCoordinator', () => {
  it('starts tasks by phase, dependency, and explicit order', async () => {
    const calls: string[] = []
    const coordinator = new LifecycleCoordinator({
      logger: noopLogger,
      tasks: [
        task('search', {
          dependencies: ['database'],
          order: 10,
          start: () => {
            calls.push('search')
          },
        }),
        task('settings', {
          dependencies: ['database'],
          order: 5,
          phase: 'infrastructure',
          start: () => {
            calls.push('settings')
          },
        }),
        task('database', {
          order: 10,
          phase: 'infrastructure',
          start: () => {
            calls.push('database')
          },
        }),
        task('telemetry', {
          order: 1,
          phase: 'services',
          start: () => {
            calls.push('telemetry')
          },
        }),
      ],
    })

    await coordinator.startup()

    expect(calls).toEqual(['database', 'settings', 'telemetry', 'search'])
  })

  it('rejects a critical failure and does not start its dependants', async () => {
    const calls: string[] = []
    const failure = new Error('database unavailable')
    const coordinator = new LifecycleCoordinator({
      logger: noopLogger,
      tasks: [
        task('database', {
          phase: 'infrastructure',
          start: async () => {
            calls.push('database')
            throw failure
          },
        }),
        task('window-runtime', {
          dependencies: ['database'],
          phase: 'runtime',
          start: () => {
            calls.push('window-runtime')
          },
        }),
      ],
    })

    await expect(coordinator.startup()).rejects.toEqual(
      new LifecycleStartupError('database', failure),
    )
    expect(calls).toEqual(['database'])
  })

  it('shuts down only started tasks in reverse startup order', async () => {
    const calls: string[] = []
    const coordinator = new LifecycleCoordinator({
      logger: noopLogger,
      tasks: [
        task('database', {
          phase: 'infrastructure',
          start: () => {
            calls.push('start:database')
          },
          stop: () => {
            calls.push('stop:database')
          },
        }),
        task('search', {
          dependencies: ['database'],
          start: () => {
            calls.push('start:search')
          },
          stop: async () => {
            calls.push('stop:search')
          },
        }),
        task('runtime', {
          dependencies: ['search'],
          phase: 'runtime',
          start: () => {
            calls.push('start:runtime')
          },
          stop: () => {
            calls.push('stop:runtime')
          },
        }),
      ],
    })

    await coordinator.startup()
    await coordinator.shutdown()

    expect(calls).toEqual([
      'start:database',
      'start:search',
      'start:runtime',
      'stop:runtime',
      'stop:search',
      'stop:database',
    ])
  })

  it('coalesces concurrent startup and shutdown calls', async () => {
    let finishStart!: () => void
    const startBarrier = new Promise<void>((resolve) => {
      finishStart = resolve
    })
    const start = vi.fn(() => startBarrier)
    const stop = vi.fn(async () => undefined)
    const coordinator = new LifecycleCoordinator({
      logger: noopLogger,
      tasks: [task('database', { phase: 'infrastructure', start, stop })],
    })

    const firstStartup = coordinator.startup()
    const secondStartup = coordinator.startup()
    finishStart()
    await Promise.all([firstStartup, secondStartup])
    await Promise.all([coordinator.shutdown(), coordinator.shutdown()])
    await coordinator.shutdown()

    expect(start).toHaveBeenCalledOnce()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('retries only cleanup tasks that failed during a previous shutdown', async () => {
    const databaseStop = vi.fn(async () => undefined)
    const runtimeStop = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('runtime busy'))
      .mockResolvedValueOnce(undefined)
    const coordinator = new LifecycleCoordinator({
      logger: noopLogger,
      tasks: [
        task('database', {
          phase: 'infrastructure',
          start: () => undefined,
          stop: databaseStop,
        }),
        task('runtime', {
          dependencies: ['database'],
          phase: 'runtime',
          start: () => undefined,
          stop: runtimeStop,
        }),
      ],
    })

    await coordinator.startup()
    await expect(coordinator.shutdown()).rejects.toThrow('lifecycle tasks failed to stop')
    await coordinator.shutdown()

    expect(runtimeStop).toHaveBeenCalledTimes(2)
    expect(databaseStop).toHaveBeenCalledOnce()
  })
})
