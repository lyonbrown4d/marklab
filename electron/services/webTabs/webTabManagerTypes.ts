import type { BrowserWindow, Rectangle, WebContentsView } from 'electron'
import type { CompiledWebTabShortcut } from '@electron/services/webTabs/webTabShortcuts'
import type { WebTabBounds, WebTabEvent, WebTabState } from '@/types/webTabs'

export type WebTabViewConstructor = new (
  options?: Electron.WebContentsViewConstructorOptions,
) => WebContentsView

export type WebTabEntry = {
  attached: boolean
  bounds: WebTabBounds
  cleanupEvents: () => void
  lastUsed: number
  loadGeneration: number
  ready: boolean
  state: WebTabState
  view: WebContentsView
}

export type WebTabWindowState = {
  activeTabId: string | null
  cleanup: () => void
  entries: Map<string, WebTabEntry>
  owner: BrowserWindow
  shortcuts: CompiledWebTabShortcut[]
}

export const clampWebTabBounds = (bounds: WebTabBounds, content: Rectangle): WebTabBounds => {
  const x = Math.min(Math.max(0, bounds.x), Math.max(0, content.width - 1))
  const y = Math.min(Math.max(0, bounds.y), Math.max(0, content.height - 1))
  return {
    height: Math.max(1, Math.min(bounds.height, content.height - y)),
    width: Math.max(1, Math.min(bounds.width, content.width - x)),
    x,
    y,
  }
}

export const sendWebTabEvent = (
  window: BrowserWindow,
  channel: string,
  event: WebTabEvent,
): void => {
  if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send(channel, event)
  }
}

export const attachWebTabView = (state: WebTabWindowState, entry: WebTabEntry): void => {
  if (!entry.attached) state.owner.contentView.addChildView(entry.view)
  entry.attached = true
  entry.view.setBounds(entry.bounds)
  entry.view.setVisible(true)
  entry.view.webContents.setAudioMuted(false)
  entry.view.webContents.setBackgroundThrottling(false)
}

export const detachWebTabView = (state: WebTabWindowState, entry: WebTabEntry): void => {
  entry.view.setVisible(false)
  entry.view.webContents.setAudioMuted(true)
  entry.view.webContents.setBackgroundThrottling(true)
  if (!entry.attached) return
  state.owner.contentView.removeChildView(entry.view)
  entry.attached = false
}

export const updateWebTabActiveStates = (
  state: WebTabWindowState,
  emit: (entry: WebTabEntry) => void,
): void => {
  for (const entry of state.entries.values()) {
    const active = state.activeTabId === entry.state.tabId
    if (entry.state.active === active) continue
    entry.state.active = active
    emit(entry)
  }
}

export const updateWebTabHistory = (entry: WebTabEntry): void => {
  entry.state.canGoBack = entry.view.webContents.canGoBack()
  entry.state.canGoForward = entry.view.webContents.canGoForward()
}
