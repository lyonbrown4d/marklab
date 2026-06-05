import { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import type { NativeIpcRegistration } from '@electron/ipc/index.js'
import type { MenuActionDispatcher } from '@electron/menu.js'
import type { Logger } from '@electron/services/logger.js'
import type { WorkspaceService } from '@electron/services/workspace/workspaceService.js'
import type { FsRootInfo } from '@electron/services/workspace/types.js'
import { showWindowWithMotion } from '@electron/windowMotion.js'
import type { MarklabWindowPool } from '@electron/windowPool.js'

type AppWindowOpenResult = {
  ok: boolean
  windowId?: number
  requestedPath?: string
  workspacePath?: string
  rootKind?: FsRootInfo['kind']
  sharedWorkspaceSession: boolean
  error?: string
}

type PathOpenTarget = {
  path: string
  kind: 'directory' | 'file'
}

type WorkspaceSessionSeed = {
  state?: Record<string, unknown>
  version?: number
}

type AppWindowCommandDependencies = {
  copyWorkspaceSession: (
    sourceSessionKey: string,
    targetSessionKey: string,
    overrides?: Record<string, unknown>,
  ) => WorkspaceSessionSeed | null
  getCurrentWorkspaceRoot: () => FsRootInfo
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

const WORKSPACE_SESSION_SEED_EVENT = 'workspace-session-seed'

const openPooledMainWindow = async (
  dependencies: AppWindowCommandDependencies,
  reason: string,
  requestedPath: string | undefined,
  initializeWorkspace: (main: BrowserWindow) => Promise<FsRootInfo>,
): Promise<{ main: BrowserWindow; root: FsRootInfo }> => {
  const logger = dependencies.getLogger()
  const main = await dependencies.getWindowPool().acquireMainWindow()
  dependencies.installManagedMainWindowLifecycle(main, logger)
  const root = await initializeWorkspace(main)
  if (main.isMinimized()) main.restore()
  showWindowWithMotion(main, { focus: true })
  logger.info('main window opened from pool', {
    reason,
    requestedPath,
    rootKind: root.kind,
    workspacePath: root.path,
    windowId: main.id,
    windowPool: dependencies.getWindowPool().stats(),
  })
  return { main, root }
}

const sendWorkspaceSessionSeed = (
  window: BrowserWindow,
  seed: WorkspaceSessionSeed | null,
): void => {
  if (!seed || window.webContents.isDestroyed()) return
  const send = () => {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send(WORKSPACE_SESSION_SEED_EVENT, seed)
    }
  }
  send()
  setTimeout(send, 250)
}

const setWorkspaceRoot = (
  workspace: WorkspaceService,
  root: FsRootInfo,
): Promise<FsRootInfo> | FsRootInfo => {
  if (root.kind === 'single') return workspace.setSingleFile({ path: root.path })
  if (root.kind === 'external') return workspace.setRoot({ path: root.path })
  return workspace.setRoot(null)
}

const openCurrentWorkspaceInNewWindow = async (
  dependencies: AppWindowCommandDependencies,
  reason: string,
): Promise<AppWindowOpenResult> => {
  const root = dependencies.getCurrentWorkspaceRoot()
  const sourceWindow = BrowserWindow.getFocusedWindow() ?? dependencies.getPrimaryWindow()
  const { main } = await openPooledMainWindow(dependencies, reason, root.path, (window) =>
    Promise.resolve(setWorkspaceRoot(dependencies.getWorkspaceServiceForWindow(window), root)),
  )
  const targetSessionKey = dependencies.getSessionKeyForWindow(main)
  const seed = sourceWindow
    ? dependencies.copyWorkspaceSession(
        dependencies.getSessionKeyForWindow(sourceWindow),
        targetSessionKey,
        {
          rootKind: root.kind,
          rootPath: root.path,
        },
      )
    : dependencies.writeWorkspaceSession(targetSessionKey, {
        rootKind: root.kind,
        rootPath: root.path,
      })
  sendWorkspaceSessionSeed(main, seed)
  return {
    ok: true,
    windowId: main.id,
    requestedPath: root.path,
    workspacePath: root.path,
    rootKind: root.kind,
    sharedWorkspaceSession: false,
  }
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
): Promise<FsRootInfo> => {
  if (target.kind === 'directory') return workspace.setRoot({ path: target.path })
  return workspace.setSingleFile({ path: target.path })
}

const openPathInNewWindow = async (
  dependencies: AppWindowCommandDependencies,
  value: unknown,
  reason: string,
): Promise<AppWindowOpenResult> => {
  const target = await parsePathOpenTarget(value)
  const { main, root } = await openPooledMainWindow(dependencies, reason, target.path, (window) =>
    setWorkspaceTarget(dependencies.getWorkspaceServiceForWindow(window), target),
  )
  sendWorkspaceSessionSeed(
    main,
    dependencies.writeWorkspaceSession(dependencies.getSessionKeyForWindow(main), {
      activeTabId: null,
      rootKind: root.kind,
      rootPath: root.path,
      tabs: [],
    }),
  )
  return {
    ok: true,
    windowId: main.id,
    requestedPath: target.path,
    workspacePath: root.path,
    rootKind: root.kind,
    sharedWorkspaceSession: false,
  }
}

export const createAppWindowCommandHandlers = (
  dependencies: AppWindowCommandDependencies,
): NativeCommandHandlers => {
  return {
    open_current_workspace_in_new_window: () =>
      openCurrentWorkspaceInNewWindow(dependencies, 'open_current_workspace_in_new_window'),
    open_path_in_new_window: (payload) =>
      openPathInNewWindow(dependencies, payload, 'open_path_in_new_window'),
  }
}

export const createNativeMenuActionDispatcher = (
  dependencies: AppWindowCommandDependencies,
): MenuActionDispatcher => {
  return (id) => {
    if (id === 'window.open_current_workspace_in_new_window') {
      void openCurrentWorkspaceInNewWindow(dependencies, 'menu').catch((error) => {
        dependencies.getLogger().error('failed to open current workspace in new window', {
          error,
        })
      })
      return
    }

    const target = BrowserWindow.getFocusedWindow() ?? dependencies.getPrimaryWindow()
    const nativeIpc = dependencies.getNativeIpc()
    if (target && nativeIpc?.menu.dispatchToWindow(target, id)) return
    target?.webContents.send('menu-action', id)
  }
}
