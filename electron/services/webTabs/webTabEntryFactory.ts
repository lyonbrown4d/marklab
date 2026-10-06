import {
  configureWebTabSession,
  installNavigationGuard,
} from '@electron/services/webTabs/webTabSecurity'
import {
  clampWebTabBounds,
  type WebTabEntry,
  type WebTabViewConstructor,
  type WebTabWindowState,
} from '@electron/services/webTabs/webTabManagerTypes'
import type { WebTabActivateRequest } from '@/types/webTabs'

export const createWebTabEntry = (options: {
  WebContentsView: WebTabViewConstructor
  lastUsed: number
  request: WebTabActivateRequest
  state: WebTabWindowState
  url: string
}): WebTabEntry => {
  const view = new options.WebContentsView({
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: false,
      disableDialogs: true,
      nodeIntegration: false,
      partition: `marklab-web-tabs-${options.state.owner.id}`,
      preload: undefined,
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
  })
  const entry: WebTabEntry = {
    attached: false,
    bounds: clampWebTabBounds(options.request.bounds, options.state.owner.getContentBounds()),
    cleanupEvents: () => undefined,
    lastUsed: options.lastUsed,
    loadGeneration: 0,
    ready: false,
    state: {
      active: false,
      canGoBack: false,
      canGoForward: false,
      status: 'idle',
      tabId: options.request.tabId,
      title: '',
      url: options.url,
    },
    view,
  }
  view.setBounds(entry.bounds)
  view.setVisible(false)
  view.webContents.setAudioMuted(true)
  view.webContents.setBackgroundThrottling(true)
  configureWebTabSession(view.webContents.session)
  installNavigationGuard(view.webContents)
  return entry
}
