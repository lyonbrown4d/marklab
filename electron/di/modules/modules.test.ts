import type * as Electron from 'electron'
import { Container, ContainerModule } from 'inversify'
import { describe, expect, it } from 'vitest'

import { aiModule } from '@electron/di/modules/ai'
import { contentModule } from '@electron/di/modules/desktop/content'
import { createNativeRuntimeModule } from '@electron/di/modules/desktop/nativeRuntime'
import { scmGraphModule } from '@electron/di/modules/desktop/scmGraph'
import { workspaceModule } from '@electron/di/modules/desktop/workspace'
import { createInfrastructureModule } from '@electron/di/modules/infrastructure'
import { lifecycleModule } from '@electron/di/modules/lifecycle'
import { syncModule } from '@electron/di/modules/sync'
import { OwnedResourceRegistry } from '@electron/di/ownedResourceRegistry'
import { TOKENS, type ElectronToken } from '@electron/di/tokens'
import type { ElectronRuntimeDependencies } from '@electron/di/types'
import { noopLogger } from '@electron/services/logger'

describe('Electron DI modules', () => {
  it('loads infrastructure bindings without leaking domain bindings', () => {
    const module = createInfrastructureModule(runtimeDependencies, noopLogger)
    const container = load(module)

    expect(module).toBeInstanceOf(ContainerModule)
    expectBound(container, [
      TOKENS.app,
      TOKENS.BrowserWindow,
      TOKENS.WebContentsView,
      TOKENS.safeStorage,
      TOKENS.shell,
      TOKENS.lifecycleTasks,
      TOKENS.logger,
      TOKENS.localDatabaseService,
      TOKENS.settingsStore,
      TOKENS.localHistoryService,
    ])
    expect(container.isBound(TOKENS.aiService)).toBe(false)
    expect(container.isBound(TOKENS.workspaceRegistry)).toBe(false)
  })

  it.each([
    [
      'AI',
      aiModule,
      [
        TOKENS.aiProviderStore,
        TOKENS.aiModelResolver,
        TOKENS.aiService,
        TOKENS.aiInlineCompletionPolicy,
        TOKENS.aiInlineCompletionService,
      ],
      TOKENS.workspaceRegistry,
    ],
    [
      'desktop content',
      contentModule,
      [TOKENS.languageIntelligenceService, TOKENS.linkPreviewService, TOKENS.exportService],
      TOKENS.workspaceRegistry,
    ],
    [
      'desktop workspace',
      workspaceModule,
      [
        TOKENS.knowledgeEngineService,
        TOKENS.workspaceAnalysisScheduler,
        TOKENS.workspaceGraphScheduler,
        TOKENS.workspaceGraphStore,
        TOKENS.workspaceSearchIndexFactory,
        TOKENS.workspaceRegistry,
      ],
      TOKENS.webTabManager,
    ],
    [
      'desktop native runtime',
      createNativeRuntimeModule(new OwnedResourceRegistry()),
      [TOKENS.webTabManager, TOKENS.terminalService],
      TOKENS.gitService,
    ],
    [
      'desktop SCM and graph',
      scmGraphModule,
      [TOKENS.gitService, TOKENS.graphLayoutStore],
      TOKENS.workspaceSyncCoordinator,
    ],
    [
      'sync',
      syncModule,
      [
        TOKENS.webDavProfileStore,
        TOKENS.webDavSyncStateStore,
        TOKENS.workspaceSyncConfigStore,
        TOKENS.workspaceSyncCoordinator,
        TOKENS.workspaceWebDavSyncService,
      ],
      TOKENS.aiService,
    ],
    ['lifecycle', lifecycleModule, [TOKENS.lifecycleCoordinator], TOKENS.terminalService],
  ] as const)('loads only the %s module bindings', (_name, module, expected, unrelated) => {
    const container = load(module)

    expect(module).toBeInstanceOf(ContainerModule)
    expectBound(container, expected)
    expect(container.isBound(unrelated)).toBe(false)
  })
})

const load = (module: ContainerModule): Container => {
  const container = new Container()
  container.load(module)
  return container
}

const expectBound = (container: Container, tokens: readonly ElectronToken<unknown>[]): void => {
  for (const token of tokens) expect(container.isBound(token)).toBe(true)
}

const runtimeDependencies = {
  app: {} as Electron.App,
  BrowserWindow: {} as typeof Electron.BrowserWindow,
  WebContentsView: {} as typeof Electron.WebContentsView,
  safeStorage: {} as Electron.SafeStorage,
  shell: {} as Electron.Shell,
} satisfies ElectronRuntimeDependencies
