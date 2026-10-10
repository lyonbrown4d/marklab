import type { BrowserWindow } from 'electron'

import type { WorkspaceRootSwitchOptions } from '@electron/services/workspace/types'
import { sendWorkspaceSessionSeed } from '@electron/main/windowCommandEvents'
import { parsePathOpenTarget, setWorkspaceTarget } from '@electron/main/windowCommandTargets'
import type {
  AppWindowCommandDependencies,
  AppWindowOpenResult,
} from '@electron/main/windowCommands'
import { showWindowWithMotion } from '@electron/windowMotion'

const startupFlushBypassConsumed = new WeakSet<BrowserWindow>()

const failure = (error: unknown, requestedPath?: string): AppWindowOpenResult => ({
  error: error instanceof Error ? error.message : String(error),
  ok: false,
  requestedPath,
  sharedWorkspaceSession: false,
})

export const openPathInCurrentWindow = async (
  dependencies: AppWindowCommandDependencies,
  value: unknown,
  main: BrowserWindow | null,
  shouldFlushRendererEdits: (window: BrowserWindow) => boolean = () => true,
  presentPrimary = false,
  options: WorkspaceRootSwitchOptions = {},
): Promise<AppWindowOpenResult> => {
  let requestedPath: string | undefined
  try {
    options.signal?.throwIfAborted()
    const target = await parsePathOpenTarget(value, options)
    options.signal?.throwIfAborted()
    requestedPath = target.path
    if (!main || main.isDestroyed()) throw new Error('No active window is available.')
    if (shouldFlushRendererEdits(main)) {
      const nativeIpc = dependencies.getNativeIpc()
      if (!nativeIpc) throw new Error('Native IPC bridge is unavailable.')
      await nativeIpc.windowClose.requestRendererFlush(main)
      options.signal?.throwIfAborted()
    }
    const root = await setWorkspaceTarget(
      dependencies.getWorkspaceServiceForWindow(main),
      target,
      options,
    )
    options.signal?.throwIfAborted()
    dependencies.activateWorkspaceWindowState(main, root)
    const seed = dependencies.writeWorkspaceSession(dependencies.getSessionKeyForWindow(main), {
      activeTabId: null,
      rootKind: root.kind,
      rootPath: root.path,
      tabs: [],
    })
    sendWorkspaceSessionSeed(main, seed)
    if (!presentPrimary && main.isMinimized()) main.restore()
    if (presentPrimary) dependencies.presentPrimaryWindow(main)
    else showWindowWithMotion(main, { focus: true })
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

export const openStartupPathInCurrentWindow = (
  dependencies: AppWindowCommandDependencies,
  value: unknown,
  options: WorkspaceRootSwitchOptions = {},
): Promise<AppWindowOpenResult> => {
  const primary = dependencies.getPrimaryWindow()
  const shouldFlush = (): boolean => {
    if (
      !primary ||
      startupFlushBypassConsumed.has(primary) ||
      !dependencies.isPrimaryWindowBootstrapping(primary)
    )
      return true
    startupFlushBypassConsumed.add(primary)
    return false
  }
  return openPathInCurrentWindow(dependencies, value, primary, shouldFlush, true, options)
}
