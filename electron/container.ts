import { asFunction, createContainer, InjectionMode, type AwilixContainer } from 'awilix'

import {
  createElectronRegistrations,
  type ElectronRuntimeDependencies,
  type ElectronServiceCradle,
} from '@electron/containerRegistrations'
import { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import { createMainLifecycleTasks } from '@electron/main/lifecycle/mainLifecycleTasks'
import { createElectronLogger } from '@electron/services/logger'
import { configureSettingsStore } from '@electron/services/settingsStore'
import { configureUserThemeStoreLogger } from '@electron/services/userThemeStore'

export type { ElectronRuntimeDependencies } from '@electron/containerRegistrations'

export type ElectronCradle = ElectronServiceCradle & {
  lifecycleCoordinator: LifecycleCoordinator
}

export type ElectronContainer = AwilixContainer<ElectronCradle>

type ElectronContainerShutdownTarget = {
  cradle: { lifecycleCoordinator: Pick<LifecycleCoordinator, 'shutdown'> }
  dispose: () => Promise<void>
}

export const createElectronContainer = (
  dependencies: ElectronRuntimeDependencies,
): ElectronContainer => {
  const logger = createElectronLogger({ isPackaged: dependencies.app.isPackaged }).child('main')
  configureUserThemeStoreLogger(logger.child('themes'))

  const container = createContainer<ElectronCradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  })
  container.register(createElectronRegistrations(dependencies, logger))
  container.register({
    lifecycleCoordinator: asFunction((cradle: ElectronCradle) => {
      return new LifecycleCoordinator({
        logger: cradle.logger,
        tasks: [
          ...createMainLifecycleTasks({
            configureSettingsStore,
            getKnowledgeEngineService: () => cradle.knowledgeEngineService,
            getLinkPreviewService: () => cradle.linkPreviewService,
            getLocalHistoryService: () => cradle.localHistoryService,
            getSettingsStore: () => cradle.settingsStore,
            localDatabaseService: cradle.localDatabaseService,
          }),
          ...(dependencies.lifecycleTasks ?? []),
        ],
      })
    })
      .singleton()
      .disposer((coordinator) => coordinator.shutdown()),
  })
  return container
}

export const shutdownElectronContainer = async (
  container: ElectronContainerShutdownTarget,
): Promise<void> => {
  const failures: unknown[] = []
  try {
    await container.cradle.lifecycleCoordinator.shutdown()
  } catch (error) {
    failures.push(error)
  }
  try {
    await container.dispose()
  } catch (error) {
    failures.push(error)
  }
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Electron container shutdown failed')
  }
}
