import { Container } from 'inversify'

import { aiModule } from '@electron/di/modules/ai'
import { createDesktopModules } from '@electron/di/modules/desktop'
import { createInfrastructureModule } from '@electron/di/modules/infrastructure'
import { lifecycleModule } from '@electron/di/modules/lifecycle'
import { syncModule } from '@electron/di/modules/sync'
import { OwnedResourceRegistry } from '@electron/di/ownedResourceRegistry'
import { TOKENS, type ElectronToken } from '@electron/di/tokens'
import type {
  ElectronRuntime,
  ElectronRuntimeDependencies,
  ElectronServices,
} from '@electron/di/types'
import type { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import { createElectronLogger } from '@electron/services/logger'
import type { TerminalService } from '@electron/services/terminal/service'
import { configureUserThemeStoreLogger } from '@electron/services/userThemeStore'
import type { WebTabManager } from '@electron/services/webTabs/webTabManager'

export type {
  ElectronRuntime,
  ElectronRuntimeDependencies,
  ElectronServices,
} from '@electron/di/types'

export type ElectronBindingOverrides = {
  set: <T>(token: ElectronToken<T>, value: T) => void
}

type ElectronRuntimeOptions = {
  configure?: (overrides: ElectronBindingOverrides) => void
}

export const createElectronRuntime = (
  dependencies: ElectronRuntimeDependencies,
  options: ElectronRuntimeOptions = {},
): ElectronRuntime => {
  const logger = createElectronLogger({ isPackaged: dependencies.app.isPackaged }).child('main')
  configureUserThemeStoreLogger(logger.child('themes'))

  const container = new Container()
  const ownedResources = new OwnedResourceRegistry()
  container.load(
    createInfrastructureModule(dependencies, logger),
    aiModule,
    ...createDesktopModules(ownedResources),
    syncModule,
    lifecycleModule,
  )
  options.configure?.(createBindingOverrides(container, ownedResources))
  assertAllTokensBound(container)

  const services = createElectronServices(container)
  let shutdownPromise: Promise<void> | null = null

  return {
    services,
    shutdown: () => {
      shutdownPromise ??= shutdownRuntime(
        container.get(TOKENS.lifecycleCoordinator),
        ownedResources,
        () => container.unbindAllAsync(),
      ).catch((error: unknown) => {
        shutdownPromise = null
        throw error
      })
      return shutdownPromise
    },
    startup: () => container.get(TOKENS.lifecycleCoordinator).startup(),
  }
}

const assertAllTokensBound = (container: Container): void => {
  const missing = Object.entries(TOKENS)
    .filter(([, token]) => !container.isBound(token))
    .map(([name]) => name)
  if (missing.length > 0) {
    throw new Error(`Electron dependency bindings are missing: ${missing.join(', ')}`)
  }
}

const createBindingOverrides = (
  container: Container,
  ownedResources: OwnedResourceRegistry,
): ElectronBindingOverrides => ({
  set: <T>(token: ElectronToken<T>, value: T): void => {
    const binding = container.rebind(token).toConstantValue(value)
    if (token === (TOKENS.terminalService as ElectronToken<T>)) {
      binding.onActivation((_context, service) =>
        ownedResources.track(token, service, (owned) => (owned as TerminalService).dispose()),
      )
    }
    if (token === (TOKENS.webTabManager as ElectronToken<T>)) {
      binding.onActivation((_context, service) =>
        ownedResources.track(token, service, (owned) => (owned as WebTabManager).dispose()),
      )
    }
  },
})

const createElectronServices = (container: Container): ElectronServices => ({
  get aiInlineCompletionService() {
    return container.get(TOKENS.aiInlineCompletionService)
  },
  get aiService() {
    return container.get(TOKENS.aiService)
  },
  get exportService() {
    return container.get(TOKENS.exportService)
  },
  get gitService() {
    return container.get(TOKENS.gitService)
  },
  get graphLayoutStore() {
    return container.get(TOKENS.graphLayoutStore)
  },
  get knowledgeEngineService() {
    return container.get(TOKENS.knowledgeEngineService)
  },
  get languageIntelligenceService() {
    return container.get(TOKENS.languageIntelligenceService)
  },
  get linkPreviewService() {
    return container.get(TOKENS.linkPreviewService)
  },
  get localHistoryService() {
    return container.get(TOKENS.localHistoryService)
  },
  get logger() {
    return container.get(TOKENS.logger)
  },
  get terminalService() {
    return container.get(TOKENS.terminalService)
  },
  get webDavProfileStore() {
    return container.get(TOKENS.webDavProfileStore)
  },
  get webTabManager() {
    return container.get(TOKENS.webTabManager)
  },
  get workspaceRegistry() {
    return container.get(TOKENS.workspaceRegistry)
  },
  get workspaceSyncConfigStore() {
    return container.get(TOKENS.workspaceSyncConfigStore)
  },
  get workspaceSyncCoordinator() {
    return container.get(TOKENS.workspaceSyncCoordinator)
  },
  get workspaceWebDavSyncService() {
    return container.get(TOKENS.workspaceWebDavSyncService)
  },
})

const shutdownRuntime = async (
  lifecycleCoordinator: Pick<LifecycleCoordinator, 'shutdown'>,
  ownedResources: OwnedResourceRegistry,
  releaseBindings: () => Promise<void>,
): Promise<void> => {
  const failures: unknown[] = []
  try {
    await lifecycleCoordinator.shutdown()
  } catch (error) {
    collectFailures(failures, error)
  }
  try {
    failures.push(...(await ownedResources.disposeAll()))
  } catch (error) {
    collectFailures(failures, error)
  }

  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Electron runtime shutdown failed')
  }
  await releaseBindings()
}

const collectFailures = (failures: unknown[], error: unknown): void => {
  if (error instanceof AggregateError) {
    failures.push(...error.errors)
    return
  }
  failures.push(error)
}
