import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'

import { nativeIpcChannels } from '@electron/channels.js'
import type { WebTabManager } from '@electron/services/webTabs/webTabManager.js'
import type { WindowWorkspaceRegistry } from '@electron/services/workspace/windowWorkspaceRegistry.js'
import {
  webTabActivateRequestSchema,
  webTabIdRequestSchema,
  webTabNavigateRequestSchema,
  webTabSetBoundsRequestSchema,
  webTabShortcutBindingsRequestSchema,
  type WebTabActionResult,
} from '@/types/webTabs.js'

type WebTabsIpcDependencies = {
  BrowserWindow: typeof BrowserWindow
  manager: WebTabManager
  workspaceRegistry: Pick<WindowWorkspaceRegistry, 'isManagedWebContents' | 'serviceForWebContents'>
}

const success = (): WebTabActionResult => ({ ok: true })

export const registerWebTabsIpc = (
  ipcMain: Pick<IpcMain, 'handle'>,
  dependencies: WebTabsIpcDependencies,
): void => {
  const withOwner =
    <T>(
      schema: { parse: (payload: unknown) => T },
      run: (owner: BrowserWindow, value: T) => void,
    ) =>
    (event: IpcMainInvokeEvent, payload: unknown): WebTabActionResult => {
      const owner = ownerForEvent(event, dependencies)
      run(owner, schema.parse(payload))
      return success()
    }

  ipcMain.handle(
    nativeIpcChannels.webTabsActivate,
    withOwner(webTabActivateRequestSchema, (owner, request) =>
      dependencies.manager.activate(owner, request),
    ),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsSetBounds,
    withOwner(webTabSetBoundsRequestSchema, (owner, request) =>
      dependencies.manager.setBounds(owner, request),
    ),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsHide,
    withOwner(webTabIdRequestSchema, (owner, request) => dependencies.manager.hide(owner, request)),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsClose,
    withOwner(webTabIdRequestSchema, (owner, request) =>
      dependencies.manager.close(owner, request),
    ),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsNavigate,
    withOwner(webTabNavigateRequestSchema, (owner, request) =>
      dependencies.manager.navigate(owner, request),
    ),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsGoBack,
    withOwner(webTabIdRequestSchema, (owner, request) =>
      dependencies.manager.goBack(owner, request),
    ),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsGoForward,
    withOwner(webTabIdRequestSchema, (owner, request) =>
      dependencies.manager.goForward(owner, request),
    ),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsReload,
    withOwner(webTabIdRequestSchema, (owner, request) =>
      dependencies.manager.reload(owner, request),
    ),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsStop,
    withOwner(webTabIdRequestSchema, (owner, request) => dependencies.manager.stop(owner, request)),
  )
  ipcMain.handle(
    nativeIpcChannels.webTabsSetShortcutBindings,
    withOwner(webTabShortcutBindingsRequestSchema, (owner, request) =>
      dependencies.manager.setShortcutBindings(owner, request),
    ),
  )
}

const ownerForEvent = (
  event: IpcMainInvokeEvent,
  dependencies: WebTabsIpcDependencies,
): BrowserWindow => {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Web tab requests are only allowed from the main frame')
  }
  if (!dependencies.workspaceRegistry.isManagedWebContents(event.sender)) {
    throw new Error('Web tab requests require a managed window')
  }
  dependencies.workspaceRegistry.serviceForWebContents(event.sender)
  const owner = dependencies.BrowserWindow.fromWebContents(event.sender)
  if (!owner || owner.isDestroyed()) throw new Error('No managed window owns the web tab request')
  return owner
}
