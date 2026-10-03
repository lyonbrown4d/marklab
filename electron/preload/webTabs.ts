import { ipcRenderer, type IpcRenderer, type IpcRendererEvent } from 'electron'

import { nativeIpcChannels, type NativeIpcChannel } from '@electron/channels.js'
import {
  webTabActionResultSchema,
  webTabEventSchema,
  type WebTabActionResult,
  type WebTabsApi,
} from '@/types/webTabs.js'

type WebTabsIpcRenderer = Pick<IpcRenderer, 'invoke' | 'on' | 'removeListener'>

export const createWebTabsPreloadSurface = (
  renderer: WebTabsIpcRenderer = ipcRenderer,
): WebTabsApi => {
  const invoke = async (
    operation: string,
    channel: NativeIpcChannel,
    request: unknown,
  ): Promise<WebTabActionResult> => {
    const result: unknown = await renderer.invoke(channel, request)
    const parsed = webTabActionResultSchema.safeParse(result)
    if (!parsed.success) throw new Error(`Invalid webTabs.${operation} response`)
    return parsed.data
  }

  return {
    activate: (request) => invoke('activate', nativeIpcChannels.webTabsActivate, request),
    close: (request) => invoke('close', nativeIpcChannels.webTabsClose, request),
    goBack: (request) => invoke('goBack', nativeIpcChannels.webTabsGoBack, request),
    goForward: (request) => invoke('goForward', nativeIpcChannels.webTabsGoForward, request),
    hide: (request) => invoke('hide', nativeIpcChannels.webTabsHide, request),
    navigate: (request) => invoke('navigate', nativeIpcChannels.webTabsNavigate, request),
    onState: (handler) => {
      const listener = (_event: IpcRendererEvent, payload: unknown) => {
        const parsed = webTabEventSchema.safeParse(payload)
        if (parsed.success) handler(parsed.data)
      }
      renderer.on(nativeIpcChannels.webTabsState, listener)
      return () => renderer.removeListener(nativeIpcChannels.webTabsState, listener)
    },
    reload: (request) => invoke('reload', nativeIpcChannels.webTabsReload, request),
    setBounds: (request) => invoke('setBounds', nativeIpcChannels.webTabsSetBounds, request),
    setShortcutBindings: (request) =>
      invoke('setShortcutBindings', nativeIpcChannels.webTabsSetShortcutBindings, request),
    stop: (request) => invoke('stop', nativeIpcChannels.webTabsStop, request),
  }
}
