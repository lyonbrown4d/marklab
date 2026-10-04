import {
  detachWebTabView,
  type WebTabEntry,
  type WebTabWindowState,
} from '@electron/services/webTabs/webTabManagerTypes.js'

export const shouldReplaceWebTabEntry = (entry: WebTabEntry): boolean =>
  entry.state.status === 'crashed' || entry.view.webContents.isDestroyed()

export const destroyWebTabEntry = (
  state: WebTabWindowState,
  entry: WebTabEntry,
  options: { emitClosed: boolean; onStateChanged: (entry: WebTabEntry) => void },
): void => {
  detachWebTabView(state, entry)
  entry.cleanupEvents()
  state.entries.delete(entry.state.tabId)
  if (state.activeTabId === entry.state.tabId) state.activeTabId = null
  if (options.emitClosed) {
    entry.state.active = false
    entry.state.status = 'closed'
    options.onStateChanged(entry)
  }
  if (!entry.view.webContents.isDestroyed()) entry.view.webContents.close()
}

export const evictWebTabOverflow = (
  state: WebTabWindowState,
  maxEntries: number,
  onStateChanged: (entry: WebTabEntry) => void,
): void => {
  while (state.entries.size > maxEntries) {
    const candidates = [...state.entries.values()].filter(
      (entry) => entry.state.tabId !== state.activeTabId,
    )
    const oldest = candidates.sort((left, right) => left.lastUsed - right.lastUsed)[0]
    if (!oldest) return
    destroyWebTabEntry(state, oldest, { emitClosed: true, onStateChanged })
  }
}
