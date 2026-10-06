import { describe, expect, it, vi } from 'vitest'

import { createRuntimeLifecycleTasks } from '@electron/main/lifecycle/runtimeLifecycleTasks'

describe('runtime lifecycle tasks', () => {
  it('starts the monitor before registering the native runtime and disposes it on shutdown', async () => {
    const calls: string[] = []
    const tasks = createRuntimeLifecycleTasks({
      disposeSystemThemeMonitor: vi.fn(() => {
        calls.push('theme:stop')
      }),
      registerNativeRuntime: vi.fn(() => {
        calls.push('runtime:start')
      }),
      startSystemThemeMonitor: vi.fn(() => {
        calls.push('theme:start')
      }),
    })

    expect(
      tasks.map(({ dependencies, name, order, phase }) => ({ dependencies, name, order, phase })),
    ).toEqual([
      {
        dependencies: ['knowledge-engine'],
        name: 'system-theme-monitor',
        order: 10,
        phase: 'runtime',
      },
      {
        dependencies: ['settings-store', 'system-theme-monitor'],
        name: 'native-runtime',
        order: 20,
        phase: 'runtime',
      },
    ])

    await tasks[0]?.start()
    await tasks[1]?.start()
    await tasks[0]?.stop?.()

    expect(calls).toEqual(['theme:start', 'runtime:start', 'theme:stop'])
  })
})
