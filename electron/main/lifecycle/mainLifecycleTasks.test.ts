import { describe, expect, it, vi } from 'vitest'

import { createMainLifecycleTasks } from '@electron/main/lifecycle/mainLifecycleTasks'
import { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import { noopLogger } from '@electron/services/logger'

describe('main lifecycle tasks', () => {
  it('describes database and service lifecycle dependencies explicitly', async () => {
    const dependencies = createDependencies()
    const tasks = createMainLifecycleTasks(dependencies)

    expect(
      tasks.map(({ critical, dependencies, name, order, phase }) => ({
        critical,
        dependencies,
        name,
        order,
        phase,
      })),
    ).toEqual([
      {
        critical: true,
        dependencies: [],
        name: 'local-database',
        order: 10,
        phase: 'infrastructure',
      },
      {
        critical: true,
        dependencies: ['local-database'],
        name: 'settings-store',
        order: 20,
        phase: 'infrastructure',
      },
      {
        critical: false,
        dependencies: ['settings-store'],
        name: 'workspace-user-guide',
        order: 30,
        phase: 'infrastructure',
      },
      {
        critical: true,
        dependencies: ['local-database'],
        name: 'knowledge-engine',
        order: 10,
        phase: 'services',
      },
      {
        critical: true,
        dependencies: ['local-database'],
        name: 'link-preview',
        order: 20,
        phase: 'services',
      },
      {
        critical: true,
        dependencies: ['local-database'],
        name: 'local-history',
        order: 30,
        phase: 'services',
      },
      {
        critical: true,
        dependencies: ['knowledge-engine', 'local-history'],
        name: 'workspace-registry',
        order: 40,
        phase: 'services',
      },
    ])
  })

  it('awaits database and knowledge-engine startup and exposes awaited cleanup', async () => {
    const dependencies = createDependencies()
    const tasks = createMainLifecycleTasks(dependencies)

    for (const lifecycleTask of tasks) await lifecycleTask.start()
    for (const lifecycleTask of [...tasks].reverse()) await lifecycleTask.stop?.()

    expect(dependencies.localDatabaseService.initialize).toHaveBeenCalledOnce()
    expect(dependencies.configureSettingsStore).toHaveBeenCalledWith(dependencies.settingsStore)
    expect(dependencies.prepareWorkspaceUserGuide).toHaveBeenCalledOnce()
    expect(dependencies.prepareWorkspaceUserGuide.mock.invocationCallOrder[0]).toBeGreaterThan(
      dependencies.configureSettingsStore.mock.invocationCallOrder[0]!,
    )
    expect(dependencies.prepareWorkspaceUserGuide.mock.invocationCallOrder[0]).toBeLessThan(
      dependencies.knowledgeEngineService.initialize.mock.invocationCallOrder[0]!,
    )
    expect(dependencies.knowledgeEngineService.initialize).toHaveBeenCalledOnce()
    expect(dependencies.localHistoryService.initialize).toHaveBeenCalledOnce()
    expect(dependencies.localHistoryService.dispose).toHaveBeenCalledOnce()
    expect(dependencies.workspaceRegistry.disposeAll).toHaveBeenCalledOnce()
    expect(dependencies.linkPreviewService.dispose).toHaveBeenCalledOnce()
    expect(dependencies.knowledgeEngineService.dispose).toHaveBeenCalledOnce()
    expect(dependencies.localDatabaseService.close).toHaveBeenCalledOnce()
  })

  it.each(['sidecar missing', undefined])(
    'fails the critical knowledge-engine task with error %s',
    async (error) => {
      const dependencies = createDependencies()
      dependencies.knowledgeEngineService.initialize.mockResolvedValue({
        error,
        ok: false,
      })
      const knowledgeEngine = createMainLifecycleTasks(dependencies).find(
        ({ name }) => name === 'knowledge-engine',
      )

      await expect(knowledgeEngine?.start()).rejects.toThrow(
        error ?? 'Knowledge engine startup failed',
      )
    },
  )

  it('continues opening workspaces when bundled guides cannot be prepared', async () => {
    const dependencies = createDependencies()
    dependencies.prepareWorkspaceUserGuide.mockRejectedValue(new Error('resources missing'))
    const coordinator = new LifecycleCoordinator({
      logger: noopLogger,
      tasks: createMainLifecycleTasks(dependencies),
    })
    await expect(coordinator.startup()).resolves.toBeUndefined()
    expect(dependencies.getWorkspaceRegistry).toHaveBeenCalledOnce()
    await coordinator.shutdown()
  })
})

const createDependencies = () => {
  const initializeKnowledgeEngine = vi.fn<() => Promise<{ error?: string; ok: boolean }>>(
    async () => ({ ok: true }),
  )
  const knowledgeEngineService = {
    dispose: vi.fn(),
    initialize: initializeKnowledgeEngine,
  }
  const linkPreviewService = { dispose: vi.fn() }
  const localHistoryService = {
    dispose: vi.fn(async () => undefined),
    initialize: vi.fn(async () => undefined),
  }
  const settingsStore = { id: 'settings' }
  const workspaceRegistry = { disposeAll: vi.fn(async () => undefined) }
  return {
    configureSettingsStore: vi.fn(),
    getKnowledgeEngineService: vi.fn(() => knowledgeEngineService),
    getLinkPreviewService: vi.fn(() => linkPreviewService),
    getLocalHistoryService: vi.fn(() => localHistoryService),
    getSettingsStore: vi.fn(() => settingsStore),
    getWorkspaceRegistry: vi.fn(() => workspaceRegistry),
    knowledgeEngineService,
    linkPreviewService,
    localDatabaseService: {
      close: vi.fn(async () => undefined),
      initialize: vi.fn(async () => undefined),
    },
    localHistoryService,
    prepareWorkspaceUserGuide: vi.fn(async () => undefined),
    settingsStore,
    workspaceRegistry,
  }
}
