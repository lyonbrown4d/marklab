import type { WebTabEvent } from '@/types/webTabs.js'
import { installWebTabEvents } from '@electron/services/webTabs/webTabEvents.js'
import type {
  WebTabEntry,
  WebTabWindowState,
} from '@electron/services/webTabs/webTabManagerTypes.js'
import { findWebTabShortcutAction } from '@electron/services/webTabs/webTabShortcuts.js'

const MAX_TITLE_LENGTH = 512

type ManagedEventCallbacks = {
  detach: () => void
  emit: (event: WebTabEvent) => void
  failed: (description: string, code?: number) => void
  loading: () => void
  navigated: (url: string) => void
  ready: () => void
  stateChanged: () => void
}

export const installManagedWebTabEvents = (
  state: WebTabWindowState,
  entry: WebTabEntry,
  callbacks: ManagedEventCallbacks,
): (() => void) => {
  const current = (work: () => void) => {
    if (state.entries.get(entry.state.tabId) === entry) work()
  }
  return installWebTabEvents(entry.view.webContents, {
    onCrashed: (description) => current(() => callbacks.failed(description)),
    onFailed: (code, description) => current(() => callbacks.failed(description, code)),
    onLoading: () => current(callbacks.loading),
    onInput: (event, input) =>
      current(() => {
        if (state.activeTabId !== entry.state.tabId || !entry.attached) return
        const action = findWebTabShortcutAction(state.shortcuts, input)
        if (!action) return
        event.preventDefault()
        if (action === 'app.commandPalette' || action === 'app.settings') callbacks.detach()
        if (!state.owner.webContents.isDestroyed()) state.owner.webContents.focus()
        callbacks.emit({ action, tabId: entry.state.tabId, type: 'shortcut' })
      }),
    onNavigated: (url) => current(() => callbacks.navigated(url)),
    onReady: () =>
      current(() => {
        if (entry.state.status === 'loading') callbacks.ready()
      }),
    onTitle: (title) =>
      current(() => {
        entry.state.title = title.slice(0, MAX_TITLE_LENGTH)
        callbacks.stateChanged()
      }),
    onWindowOpen: (url) =>
      current(() => callbacks.emit({ tabId: entry.state.tabId, type: 'open-requested', url })),
  })
}
