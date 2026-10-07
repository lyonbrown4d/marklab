import type { App, Shell } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { LifecycleCoordinator } from '@electron/main/lifecycle/lifecycleCoordinator'
import { createMainLifecycleTasks } from '@electron/main/lifecycle/mainLifecycleTasks'
import { createWindowLifecycle } from '@electron/main/windowLifecycle'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry'

vi.mock('@electron/windowPool', () => ({ createMarklabWindowPool: vi.fn() }))

const createLogger = (): Logger => {
  const logger: Logger = {
    child: () => logger,
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  return logger
}

const createLocalHistory = (dispose: () => Promise<void>): LocalHistoryServiceContract => ({
  capture: vi.fn(),
  clear: vi.fn(),
  delete: vi.fn(),
  dispose,
  initialize: vi.fn(async () => undefined),
  list: vi.fn(),
  read: vi.fn(),
  restore: vi.fn(),
})

describe('window lifecycle composition', () => {
  it('keeps quit barrier ownership through a failed lifecycle stop and retries cleanly', async () => {
    const logger = createLogger()
    const localHistoryFailure = new Error('local history is busy')
    const localHistoryDispose = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(localHistoryFailure)
      .mockResolvedValueOnce(undefined)
    const localHistory = createLocalHistory(localHistoryDispose)
    const workspaceRegistry = new WindowWorkspaceRegistry(
      Object.create(null) as App,
      Object.create(null) as Shell,
      logger,
      { localHistoryService: localHistory },
    )
    const beginShutdownBarrier = vi.spyOn(workspaceRegistry, 'beginShutdownBarrier')
    const cancelShutdownBarrier = vi.spyOn(workspaceRegistry, 'cancelShutdownBarrier')
    const completeShutdownBarrier = vi.fn((barrierId: number) =>
      (
        workspaceRegistry as WindowWorkspaceRegistry & {
          completeShutdownBarrier: (id: number) => void
        }
      ).completeShutdownBarrier(barrierId),
    )
    const coordinator = new LifecycleCoordinator({
      logger,
      tasks: createMainLifecycleTasks({
        configureSettingsStore: vi.fn(),
        getKnowledgeEngineService: () => ({
          dispose: vi.fn(async () => undefined),
          initialize: vi.fn(async () => ({ ok: true })),
        }),
        getLinkPreviewService: () => ({ dispose: vi.fn(async () => undefined) }),
        getLocalHistoryService: () => ({
          dispose: localHistory.dispose ?? vi.fn(),
          initialize: localHistory.initialize ?? vi.fn(),
        }),
        getSettingsStore: () => ({}),
        getWorkspaceRegistry: () => workspaceRegistry,
        localDatabaseService: {
          close: vi.fn(async () => undefined),
          initialize: vi.fn(async () => undefined),
        },
      }),
    })
    await coordinator.startup()
    const workspaceCommands = {
      beginShutdownBarrier: (reason: string) => workspaceRegistry.beginShutdownBarrier(reason),
      cancelShutdownBarrier: (id: number) => workspaceRegistry.cancelShutdownBarrier(id),
      completeShutdownBarrier,
      flushBuffersForShutdown: (id: number) => workspaceRegistry.flushBuffersForShutdown(id),
      flushWindowForClose: (
        window: Parameters<WindowWorkspaceRegistry['flushWindowForClose']>[0],
      ) => workspaceRegistry.flushWindowForClose(window),
    }
    const lifecycle = createWindowLifecycle({
      finalizeWindowState: vi.fn(async () => undefined),
      flushWindowState: vi.fn(async () => undefined),
      getNativeIpc: () => ({
        commands: { workspace: workspaceCommands },
        windowClose: { requestRendererFlush: vi.fn(async () => undefined) },
      }),
      getServices: () => ({
        logger,
        webTabManager: { registerWindow: vi.fn() },
        workspaceRegistry,
      }),
      getWindows: () => null,
      setWindows: vi.fn(),
    })
    const continueQuit = vi.fn()

    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit, () =>
      coordinator.shutdown(),
    )

    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith(
        'app quit cancelled because application shutdown failed',
        { error: expect.any(AggregateError) },
      ),
    )
    expect(continueQuit).not.toHaveBeenCalled()
    expect(cancelShutdownBarrier).toHaveBeenCalledOnce()
    expect(completeShutdownBarrier).not.toHaveBeenCalled()
    expect(beginShutdownBarrier).toHaveBeenCalledExactlyOnceWith('quit')

    lifecycle.handleBeforeQuit({ preventDefault: vi.fn() }, continueQuit, () =>
      coordinator.shutdown(),
    )

    await vi.waitFor(() => expect(continueQuit).toHaveBeenCalledOnce())
    expect(beginShutdownBarrier).toHaveBeenCalledTimes(2)
    expect(beginShutdownBarrier).toHaveBeenNthCalledWith(2, 'quit')
    expect(cancelShutdownBarrier).toHaveBeenCalledOnce()
    expect(completeShutdownBarrier).toHaveBeenCalledOnce()
    expect(completeShutdownBarrier.mock.invocationCallOrder[0]).toBeLessThan(
      continueQuit.mock.invocationCallOrder[0],
    )
    expect(localHistoryDispose).toHaveBeenCalledTimes(2)

    const probeBarrierId = await workspaceRegistry.beginShutdownBarrier('probe')
    workspaceRegistry.cancelShutdownBarrier(probeBarrierId)
  })
})
