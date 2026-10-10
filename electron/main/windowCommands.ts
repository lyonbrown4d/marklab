import { BrowserWindow } from 'electron'

import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke'
import type { NativeIpcRegistration } from '@electron/ipc/index'
import type { MenuActionDispatcher } from '@electron/menu'
import type { Logger } from '@electron/services/logger'
import type { FsRootInfo } from '@electron/services/workspace/types'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService'
import { showWindowWithMotion } from '@electron/windowMotion'
import type { MarklabWindowPool, WindowPoolAcquisition } from '@electron/windowPool'
import {
  createWindowOpeningProgressPublisher,
  sendWorkspaceSessionSeed,
} from '@electron/main/windowCommandEvents'
import {
  openPathInCurrentWindow,
  openStartupPathInCurrentWindow,
} from '@electron/main/windowCurrentPathOpen'
import { createWindowOpenTimings } from '@electron/main/windowOpenTimings'
import {
  parsePathOpenTarget,
  setWorkspaceRoot,
  setWorkspaceTarget,
  sourceWindowForEvent,
  workspaceRootForTarget,
} from '@electron/main/windowCommandTargets'

type WorkspaceSessionSeed = { state?: Record<string, unknown>; version?: number }

export type AppWindowOpenResult = {
  error?: string
  ok: boolean
  requestedPath?: string
  rootKind?: FsRootInfo['kind']
  sharedWorkspaceSession: false
  startup?: WindowPoolAcquisition['metrics'] & { source: WindowPoolAcquisition['source'] }
  windowId?: number
  workspacePath?: string
}

export type AppWindowCommandDependencies = {
  activateWorkspaceWindowState: (
    window: BrowserWindow,
    root: Pick<FsRootInfo, 'kind' | 'path'>,
  ) => void
  copyWorkspaceSession: (
    sourceSessionKey: string,
    targetSessionKey: string,
    overrides?: Record<string, unknown>,
  ) => WorkspaceSessionSeed | null
  getCurrentWorkspaceRoot: (source?: BrowserWindow | null) => FsRootInfo
  getLogger: () => Logger
  getNativeIpc: () => NativeIpcRegistration | null
  getPrimaryWindow: () => BrowserWindow | null
  getSessionKeyForWindow: (window: BrowserWindow) => string
  getWorkspaceServiceForWindow: (window: BrowserWindow) => WorkspaceService
  getWindowPool: () => MarklabWindowPool
  installManagedMainWindowLifecycle: (main: BrowserWindow, logger?: Logger) => void
  isPrimaryWindowBootstrapping: (window: BrowserWindow) => boolean
  presentPrimaryWindow: (window: BrowserWindow) => void
  writeWorkspaceSession: (
    targetSessionKey: string,
    state: Record<string, unknown>,
  ) => WorkspaceSessionSeed
}

type OpenWindowRequest = {
  createSeed: (target: BrowserWindow, root: FsRootInfo) => WorkspaceSessionSeed | null
  initializeWorkspace: (workspace: WorkspaceService) => Promise<FsRootInfo>
  reason: string
  requestedPath: string
  windowStateRoot: Pick<FsRootInfo, 'kind' | 'path'>
}

const failure = (error: unknown, requestedPath?: string): AppWindowOpenResult => ({
  error: error instanceof Error ? error.message : String(error),
  ok: false,
  requestedPath,
  sharedWorkspaceSession: false,
})

export { openStartupPathInCurrentWindow }

export const createAppWindowCommandHandlers = (
  dependencies: AppWindowCommandDependencies,
): NativeCommandHandlers => {
  const retries = new Map<number, () => Promise<AppWindowOpenResult>>()

  const openWindow = async (request: OpenWindowRequest): Promise<AppWindowOpenResult> => {
    const logger = dependencies.getLogger()
    let acquisition: WindowPoolAcquisition
    try {
      acquisition = await dependencies.getWindowPool().acquireMainWindow()
    } catch (error) {
      return failure(error, request.requestedPath)
    }
    const main = acquisition.window
    dependencies.installManagedMainWindowLifecycle(main, logger)
    dependencies.activateWorkspaceWindowState(main, request.windowStateRoot)
    if (main.isMinimized()) main.restore()
    showWindowWithMotion(main, { focus: true })
    const progress = createWindowOpeningProgressPublisher(main)

    const runAttempt = async (retry: boolean): Promise<AppWindowOpenResult> => {
      const timings = createWindowOpenTimings(acquisition.metrics.preparationDurationMs)
      try {
        if (retry && acquisition.source === 'cold') {
          await dependencies.getWindowPool().restoreOpeningWindow(acquisition)
        }
        progress.send({
          stage: 'starting',
          workspacePath: request.requestedPath,
        })
        progress.send({ stage: 'loading', workspacePath: request.requestedPath })
        const workspace = dependencies.getWorkspaceServiceForWindow(main)
        workspace.beginRendererHydration()
        const root = await request.initializeWorkspace(workspace)
        timings.finishPhase('workspaceInitializationMs')
        const seed = request.createSeed(main, root)
        progress.send({ stage: 'indexing', workspacePath: root.path })
        await dependencies.getWindowPool().activateMainWindow(acquisition, { standby: true })
        timings.finishPhase('rendererActivationMs')
        if (acquisition.source === 'cold') progress.replay()
        sendWorkspaceSessionSeed(main, seed)
        timings.finishPhase('sessionSeedMs')
        await dependencies.getWindowPool().waitForRendererInteractive(acquisition)
        timings.finishPhase('rendererInteractiveMs')
        workspace.markRendererInteractive()
        if (main.isMinimized()) main.restore()
        showWindowWithMotion(main, { focus: true })
        retries.delete(main.id)
        void dependencies
          .getWindowPool()
          .prewarmMainWindow()
          .catch((error) => logger.warn('unable to replenish window pool', { error }))
        logger.info('workspace window opened', {
          reason: request.reason,
          requestedPath: request.requestedPath,
          startup: { source: acquisition.source, ...acquisition.metrics },
          timings: timings.snapshot(),
          windowId: main.id,
          windowPool: dependencies.getWindowPool().stats(),
        })
        return {
          ok: true,
          requestedPath: request.requestedPath,
          rootKind: root.kind,
          sharedWorkspaceSession: false,
          startup: { source: acquisition.source, ...acquisition.metrics },
          windowId: main.id,
          workspacePath: root.path,
        }
      } catch (error) {
        const result = failure(error, request.requestedPath)
        if (!main.isDestroyed() && !main.webContents.isDestroyed()) {
          progress.send({
            error: result.error,
            stage: 'failed',
            workspacePath: request.requestedPath,
          })
          retries.set(main.id, () => runAttempt(true))
        } else {
          retries.delete(main.id)
        }
        logger.error('workspace window open failed', {
          error,
          reason: request.reason,
          windowId: main.id,
        })
        return result
      }
    }

    main.once('closed', () => retries.delete(main.id))
    return runAttempt(false)
  }

  const openCurrent = async (
    event: Electron.IpcMainInvokeEvent | null,
    reason: string,
  ): Promise<AppWindowOpenResult> => {
    try {
      const source = sourceWindowForEvent(event, dependencies.getPrimaryWindow())
      const root = dependencies.getCurrentWorkspaceRoot(source)
      return openWindow({
        createSeed: (target) =>
          source
            ? dependencies.copyWorkspaceSession(
                dependencies.getSessionKeyForWindow(source),
                dependencies.getSessionKeyForWindow(target),
                { rootKind: root.kind, rootPath: root.path },
              )
            : dependencies.writeWorkspaceSession(dependencies.getSessionKeyForWindow(target), {
                rootKind: root.kind,
                rootPath: root.path,
              }),
        initializeWorkspace: (workspace) => setWorkspaceRoot(workspace, root),
        reason,
        requestedPath: root.path,
        windowStateRoot: root,
      })
    } catch (error) {
      return failure(error)
    }
  }

  const openPath = async (value: unknown, reason: string): Promise<AppWindowOpenResult> => {
    try {
      const target = await parsePathOpenTarget(value)
      return openWindow({
        createSeed: (window, root) =>
          dependencies.writeWorkspaceSession(dependencies.getSessionKeyForWindow(window), {
            activeTabId: null,
            rootKind: root.kind,
            rootPath: root.path,
            tabs: [],
          }),
        initializeWorkspace: (workspace) => setWorkspaceTarget(workspace, target),
        reason,
        requestedPath: target.path,
        windowStateRoot: workspaceRootForTarget(target),
      })
    } catch (error) {
      return failure(error)
    }
  }

  return {
    open_current_workspace_in_new_window: (_payload, event) =>
      openCurrent(event, 'open_current_workspace_in_new_window'),
    open_path_in_current_window: (payload, event) =>
      openPathInCurrentWindow(
        dependencies,
        payload,
        sourceWindowForEvent(event, dependencies.getPrimaryWindow()),
      ),
    open_path_in_new_window: (payload) => openPath(payload, 'open_path_in_new_window'),
    retry_window_open: (_payload, event) => {
      const target = BrowserWindow.fromWebContents(event.sender)
      const retry = target ? retries.get(target.id) : null
      return retry?.() ?? failure('No failed workspace open is available to retry.')
    },
  }
}

export const createNativeMenuActionDispatcher = (
  dependencies: AppWindowCommandDependencies,
  handlers: NativeCommandHandlers = createAppWindowCommandHandlers(dependencies),
): MenuActionDispatcher => {
  return (id) => {
    if (id === 'window.open_current_workspace_in_new_window') {
      void handlers.open_current_workspace_in_new_window(undefined, null as never)
      return
    }
    const target = BrowserWindow.getFocusedWindow() ?? dependencies.getPrimaryWindow()
    const nativeIpc = dependencies.getNativeIpc()
    if (target && nativeIpc?.menu.dispatchToWindow(target, id)) return
    target?.webContents.send('menu-action', id)
  }
}
