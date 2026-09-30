import fs from 'node:fs/promises'
import path from 'node:path'

import { BrowserWindow } from 'electron'

import { nativeIpcChannels } from '@electron/channels.js'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import type { NativeIpcRegistration } from '@electron/ipc/index.js'
import type { MenuActionDispatcher } from '@electron/menu.js'
import type { Logger } from '@electron/services/logger.js'
import type { FsRootInfo } from '@electron/services/workspace/types.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import type { WindowOpeningProgress } from '@/types/windowOpening'
import { showWindowWithMotion } from '@electron/windowMotion.js'
import type { MarklabWindowPool, WindowPoolAcquisition } from '@electron/windowPool.js'

type WorkspaceSessionSeed = {
  state?: Record<string, unknown>
  version?: number
}

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

type PathOpenTarget = { kind: 'directory' | 'file'; path: string }

type AppWindowCommandDependencies = {
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
}

const failure = (error: unknown, requestedPath?: string): AppWindowOpenResult => ({
  error: error instanceof Error ? error.message : String(error),
  ok: false,
  requestedPath,
  sharedWorkspaceSession: false,
})

const sendOpeningProgress = (window: BrowserWindow, progress: WindowOpeningProgress): void => {
  if (!window.webContents.isDestroyed()) {
    window.webContents.send(nativeIpcChannels.windowOpeningProgress, progress)
  }
}

const sendWorkspaceSessionSeed = (
  window: BrowserWindow,
  seed: WorkspaceSessionSeed | null,
): void => {
  if (!seed || window.webContents.isDestroyed()) return
  const send = () => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(nativeIpcChannels.workspaceSessionSeed, seed)
      window.webContents.send('workspace-session-seed', seed)
    }
  }
  send()
  setTimeout(send, 250)
}

const setWorkspaceRoot = async (
  workspace: WorkspaceService,
  root: FsRootInfo,
): Promise<FsRootInfo> => {
  if (root.kind === 'single') return workspace.setSingleFile({ path: root.path })
  if (root.kind === 'external') return workspace.setRoot({ path: root.path })
  return workspace.setRoot(null)
}

const parsePathOpenTarget = async (value: unknown): Promise<PathOpenTarget> => {
  const raw =
    value && typeof value === 'object' && 'path' in value
      ? (value as Record<string, unknown>).path
      : value
  if (typeof raw !== 'string' || !raw.trim()) throw new Error('path must be a string')
  if (raw.includes('\0')) throw new Error('path contains invalid characters')
  const resolved = path.resolve(raw)
  const stat = await fs.stat(resolved).catch(() => null)
  if (!stat) throw new Error('path does not exist')
  if (stat.isDirectory()) return { path: resolved, kind: 'directory' }
  if (stat.isFile()) return { path: resolved, kind: 'file' }
  throw new Error('path must be a file or directory')
}

const setWorkspaceTarget = async (
  workspace: WorkspaceService,
  target: PathOpenTarget,
): Promise<FsRootInfo> =>
  target.kind === 'directory'
    ? workspace.setRoot({ path: target.path })
    : workspace.setSingleFile({ path: target.path })

const sourceWindowForEvent = (
  event: Electron.IpcMainInvokeEvent | null,
  primary: BrowserWindow | null,
): BrowserWindow | null =>
  (event ? BrowserWindow.fromWebContents(event.sender) : null) ??
  BrowserWindow.getFocusedWindow() ??
  primary

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
    if (main.isMinimized()) main.restore()
    showWindowWithMotion(main, { focus: true })

    const runAttempt = async (retry: boolean): Promise<AppWindowOpenResult> => {
      try {
        if (retry) await dependencies.getWindowPool().restoreOpeningWindow(acquisition)
        sendOpeningProgress(main, {
          stage: 'starting',
          workspacePath: request.requestedPath,
        })
        sendOpeningProgress(main, { stage: 'loading', workspacePath: request.requestedPath })
        const workspace = dependencies.getWorkspaceServiceForWindow(main)
        const root = await request.initializeWorkspace(workspace)
        const seed = request.createSeed(main, root)
        sendOpeningProgress(main, { stage: 'indexing', workspacePath: root.path })
        await dependencies.getWindowPool().activateMainWindow(acquisition)
        sendWorkspaceSessionSeed(main, seed)
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
        sendOpeningProgress(main, {
          error: result.error,
          stage: 'failed',
          workspacePath: request.requestedPath,
        })
        retries.set(main.id, () => runAttempt(true))
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
      })
    } catch (error) {
      return failure(error)
    }
  }

  const openPathInCurrentWindow = async (
    value: unknown,
    event: Electron.IpcMainInvokeEvent | null,
  ): Promise<AppWindowOpenResult> => {
    let requestedPath: string | undefined
    try {
      const target = await parsePathOpenTarget(value)
      requestedPath = target.path
      const main = sourceWindowForEvent(event, dependencies.getPrimaryWindow())
      if (!main || main.isDestroyed()) throw new Error('No active window is available.')
      const root = await setWorkspaceTarget(dependencies.getWorkspaceServiceForWindow(main), target)
      const seed = dependencies.writeWorkspaceSession(dependencies.getSessionKeyForWindow(main), {
        activeTabId: null,
        rootKind: root.kind,
        rootPath: root.path,
        tabs: [],
      })
      sendWorkspaceSessionSeed(main, seed)
      if (main.isMinimized()) main.restore()
      showWindowWithMotion(main, { focus: true })
      return {
        ok: true,
        requestedPath,
        rootKind: root.kind,
        sharedWorkspaceSession: false,
        windowId: main.id,
        workspacePath: root.path,
      }
    } catch (error) {
      return failure(error, requestedPath)
    }
  }

  return {
    open_current_workspace_in_new_window: (_payload, event) =>
      openCurrent(event, 'open_current_workspace_in_new_window'),
    open_path_in_current_window: (payload, event) => openPathInCurrentWindow(payload, event),
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
