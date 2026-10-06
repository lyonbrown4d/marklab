import type { LifecycleTask } from '@electron/main/lifecycle/types'

type RuntimeLifecycleDependencies = {
  disposeSystemThemeMonitor: () => Promise<void> | void
  registerNativeRuntime: () => Promise<void> | void
  startSystemThemeMonitor: () => Promise<void> | void
}

export const createRuntimeLifecycleTasks = (
  dependencies: RuntimeLifecycleDependencies,
): readonly LifecycleTask[] => [
  {
    critical: true,
    dependencies: ['knowledge-engine'],
    name: 'system-theme-monitor',
    order: 10,
    phase: 'runtime',
    start: dependencies.startSystemThemeMonitor,
    stop: dependencies.disposeSystemThemeMonitor,
  },
  {
    critical: true,
    dependencies: ['settings-store', 'system-theme-monitor'],
    name: 'native-runtime',
    order: 20,
    phase: 'runtime',
    start: dependencies.registerNativeRuntime,
  },
]
