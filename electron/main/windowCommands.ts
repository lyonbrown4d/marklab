import { BrowserWindow } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ElectronContainer } from '@electron/container.js'
import type { NativeCommandHandlers } from '@electron/ipc/commandInvoke.js'
import type { NativeIpcRegistration } from '@electron/ipc/index.js'
import type { MenuActionDispatcher } from '@electron/menu.js'
import type { Logger } from '@electron/services/logger.js'
import type { FsRootInfo } from '@electron/services/workspace/types.js'
import { isPathInsideOrEqual, samePath } from '@electron/services/workspace/workspaceUtils.js'
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

type AppWindowCommandDependencies = {
  getContainer: () => ElectronContainer
  getNativeIpc: () => NativeIpcRegistration | null
  getPrimaryWindow: () => BrowserWindow | null
  getWindowPool: () => MarklabWindowPool
  installManagedMainWindowLifecycle: (main: BrowserWindow, logger?: Logger) => void
}

const openPooledMainWindow = async (
  dependencies: AppWindowCommandDependencies,
  reason: string,
  requestedPath: string | undefined,
): Promise<BrowserWindow> => {
  const logger = dependencies.getContainer().cradle.logger
  const main = await dependencies.getWindowPool().acquireMainWindow()
  dependencies.installManagedMainWindowLifecycle(main, logger)
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
  logger.info('main window opened from pool', {
    reason,
    requestedPath,
    windowId: main.id,
    windowPool: dependencies.getWindowPool().stats(),
  })
  return main
}

const openCurrentWorkspaceInNewWindow = async (
  dependencies: AppWindowCommandDependencies,
  reason: string,
): Promise<AppWindowOpenResult> => {
  const root = dependencies.getContainer().cradle.workspaceService.rootInfo()
  const main = await openPooledMainWindow(dependencies, reason, root.path)
  return {
    ok: true,
    windowId: main.id,
    requestedPath: root.path,
    workspacePath: root.path,
    rootKind: root.kind,
    sharedWorkspaceSession: true,
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

const canOpenPathWithoutWorkspaceMutation = (root: FsRootInfo, target: PathOpenTarget): boolean => {
  if (root.kind === 'single') return target.kind === 'file' && samePath(root.path, target.path)
  return isPathInsideOrEqual(root.path, target.path)
}

const openPathInNewWindow = async (
  dependencies: AppWindowCommandDependencies,
  value: unknown,
  reason: string,
): Promise<AppWindowOpenResult> => {
  const target = await parsePathOpenTarget(value)
  const root = dependencies.getContainer().cradle.workspaceService.rootInfo()
  if (!canOpenPathWithoutWorkspaceMutation(root, target)) {
    const error =
      'Opening a different workspace in a new window requires per-window workspace sessions.'
    dependencies
      .getContainer()
      .cradle.logger.warn('blocked new-window path open to avoid global workspace mutation', {
        requestedPath: target.path,
        rootKind: root.kind,
        workspacePath: root.path,
      })
    return {
      ok: false,
      requestedPath: target.path,
      workspacePath: root.path,
      rootKind: root.kind,
      sharedWorkspaceSession: true,
      error,
    }
  }

  const main = await openPooledMainWindow(dependencies, reason, target.path)
  return {
    ok: true,
    windowId: main.id,
    requestedPath: target.path,
    workspacePath: root.path,
    rootKind: root.kind,
    sharedWorkspaceSession: true,
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
        dependencies
          .getContainer()
          .cradle.logger.error('failed to open current workspace in new window', {
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
