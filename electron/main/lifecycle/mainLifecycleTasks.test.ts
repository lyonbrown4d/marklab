import { describe, expect, it, vi } from 'vitest'

import { createMainLifecycleTasks } from '@electron/main/lifecycle/mainLifecycleTasks'

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
    ])
  })

  it('awaits database and knowledge-engine startup and exposes awaited cleanup', async () => {
    const dependencies = createDependencies()
    const tasks = createMainLifecycleTasks(dependencies)

    for (const lifecycleTask of tasks) await lifecycleTask.start()
    for (const lifecycleTask of [...tasks].reverse()) await lifecycleTask.stop?.()

    expect(dependencies.localDatabaseService.initialize).toHaveBeenCalledOnce()
    expect(dependencies.configureSettingsStore).toHaveBeenCalledWith(dependencies.settingsStore)
    expect(dependencies.knowledgeEngineService.initialize).toHaveBeenCalledOnce()
    expect(dependencies.localHistoryService.initialize).toHaveBeenCalledOnce()
    expect(dependencies.localHistoryService.dispose).toHaveBeenCalledOnce()
    expect(dependencies.linkPreviewService.dispose).toHaveBeenCalledOnce()
    expect(dependencies.knowledgeEngineService.dispose).toHaveBeenCalledOnce()
    expect(dependencies.localDatabaseService.close).toHaveBeenCalledOnce()
  })

  it('fails the critical knowledge-engine task when initialization is not ok', async () => {
    const dependencies = createDependencies()
    dependencies.knowledgeEngineService.initialize.mockResolvedValue({
      error: 'sidecar missing',
      ok: false,
    })
    const knowledgeEngine = createMainLifecycleTasks(dependencies).find(
      ({ name }) => name === 'knowledge-engine',
    )

    await expect(knowledgeEngine?.start()).rejects.toThrow('sidecar missing')
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
  return {
    configureSettingsStore: vi.fn(),
    getKnowledgeEngineService: vi.fn(() => knowledgeEngineService),
    getLinkPreviewService: vi.fn(() => linkPreviewService),
    getLocalHistoryService: vi.fn(() => localHistoryService),
    getSettingsStore: vi.fn(() => settingsStore),
    knowledgeEngineService,
    linkPreviewService,
    localDatabaseService: {
      close: vi.fn(async () => undefined),
      initialize: vi.fn(async () => undefined),
    },
    localHistoryService,
    settingsStore,
  }
}
