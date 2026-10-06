import type { LifecycleTask } from '@electron/main/lifecycle/types'

type Disposable = {
  dispose: () => Promise<void> | void
}

type InitializableDisposable = Disposable & {
  initialize: () => Promise<void>
}

type WorkspaceRegistry = {
  disposeAll: () => Promise<void>
}

type MainLifecycleDependencies<TSettings> = {
  configureSettingsStore: (settingsStore: TSettings) => unknown
  getKnowledgeEngineService: () => Disposable & {
    initialize: () => Promise<{ error?: string; ok: boolean }>
  }
  getLinkPreviewService: () => Disposable
  getLocalHistoryService: () => InitializableDisposable
  getSettingsStore: () => TSettings
  getWorkspaceRegistry: () => WorkspaceRegistry
  localDatabaseService: {
    close: () => Promise<void>
    initialize: () => Promise<void>
  }
}

export const createMainLifecycleTasks = <TSettings>(
  dependencies: MainLifecycleDependencies<TSettings>,
): readonly LifecycleTask[] => [
  {
    critical: true,
    dependencies: [],
    name: 'local-database',
    order: 10,
    phase: 'infrastructure',
    start: () => dependencies.localDatabaseService.initialize(),
    stop: () => dependencies.localDatabaseService.close(),
  },
  {
    critical: true,
    dependencies: ['local-database'],
    name: 'settings-store',
    order: 20,
    phase: 'infrastructure',
    start: () => {
      dependencies.configureSettingsStore(dependencies.getSettingsStore())
    },
  },
  knowledgeEngineTask(dependencies.getKnowledgeEngineService),
  disposalTask('link-preview', 20, dependencies.getLinkPreviewService),
  initializedDisposalTask('local-history', 30, dependencies.getLocalHistoryService),
  workspaceRegistryTask(dependencies.getWorkspaceRegistry),
]

const workspaceRegistryTask = (
  getRegistry: MainLifecycleDependencies<unknown>['getWorkspaceRegistry'],
): LifecycleTask => {
  let registry: WorkspaceRegistry | null = null
  return {
    critical: true,
    dependencies: ['knowledge-engine', 'local-history'],
    name: 'workspace-registry',
    order: 40,
    phase: 'services',
    start: () => {
      registry = getRegistry()
    },
    stop: () => registry?.disposeAll(),
  }
}

const knowledgeEngineTask = (
  getService: MainLifecycleDependencies<unknown>['getKnowledgeEngineService'],
): LifecycleTask => {
  let service: ReturnType<typeof getService> | null = null
  return {
    critical: true,
    dependencies: ['local-database'],
    name: 'knowledge-engine',
    order: 10,
    phase: 'services',
    start: async () => {
      service = getService()
      const result = await service.initialize()
      if (!result.ok) throw new Error(result.error ?? 'Knowledge engine startup failed')
    },
    stop: () => service?.dispose(),
  }
}

const disposalTask = (name: string, order: number, getService: () => Disposable): LifecycleTask => {
  let service: Disposable | null = null
  return {
    critical: true,
    dependencies: ['local-database'],
    name,
    order,
    phase: 'services',
    start: () => {
      service = getService()
    },
    stop: () => service?.dispose(),
  }
}

const initializedDisposalTask = (
  name: string,
  order: number,
  getService: () => InitializableDisposable,
): LifecycleTask => {
  let service: InitializableDisposable | null = null
  return {
    critical: true,
    dependencies: ['local-database'],
    name,
    order,
    phase: 'services',
    start: async () => {
      service = getService()
      await service.initialize()
    },
    stop: () => service?.dispose(),
  }
}
