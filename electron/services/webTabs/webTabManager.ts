import type { BrowserWindow } from 'electron'

import { nativeIpcChannels } from '@electron/channels.js'
import { createWebTabEntry } from '@electron/services/webTabs/webTabEntryFactory.js'
import { installManagedWebTabEvents } from '@electron/services/webTabs/webTabManagedEvents.js'
import {
  clampWebTabBounds,
  attachWebTabView,
  detachWebTabView,
  sendWebTabEvent,
  updateWebTabActiveStates,
  updateWebTabHistory,
  type WebTabEntry,
  type WebTabViewConstructor,
  type WebTabWindowState,
} from '@electron/services/webTabs/webTabManagerTypes.js'
import {
  destroyWebTabEntry,
  evictWebTabOverflow,
  shouldReplaceWebTabEntry,
} from '@electron/services/webTabs/webTabPool.js'
import { normalizeWebTabUrl } from '@electron/services/webTabs/webTabUrl.js'
import { compileWebTabShortcutBindings } from '@electron/services/webTabs/webTabShortcuts.js'
import {
  disposeWebTabWindow,
  installWebTabWindowListeners,
} from '@electron/services/webTabs/webTabWindowLifecycle.js'
import type {
  WebTabActivateRequest,
  WebTabIdRequest,
  WebTabNavigateRequest,
  WebTabSetBoundsRequest,
  WebTabShortcutBindingsRequest,
} from '@/types/webTabs.js'

const MAX_CACHED_VIEWS = 3
const MAX_ERROR_DESCRIPTION_LENGTH = 1024
const MAX_TITLE_LENGTH = 512

export class WebTabManager {
  private readonly windows = new Map<number, WebTabWindowState>()
  private clock = 0

  constructor(
    private readonly dependencies: {
      platform?: NodeJS.Platform
      WebContentsView: WebTabViewConstructor
    },
  ) {}

  registerWindow(owner: BrowserWindow): void {
    if (this.windows.has(owner.id)) return
    const cleanup = installWebTabWindowListeners(owner, {
      close: () => this.disposeWindow(owner.id),
      resume: () => this.attachActive(owner.id),
      suspend: () => this.detachActive(owner.id),
    })
    this.windows.set(owner.id, {
      activeTabId: null,
      cleanup,
      entries: new Map(),
      owner,
      shortcuts: [],
    })
  }

  activate(owner: BrowserWindow, request: WebTabActivateRequest): void {
    const url = normalizeWebTabUrl(request.url)
    const state = this.stateFor(owner)
    const previous = state.activeTabId ? state.entries.get(state.activeTabId) : undefined
    if (previous && previous.state.tabId !== request.tabId) this.detach(state, previous)

    let entry = state.entries.get(request.tabId)
    if (entry && shouldReplaceWebTabEntry(entry)) {
      this.destroyEntry(state, entry, false)
      entry = undefined
    }
    if (!entry) {
      entry = createWebTabEntry({
        WebContentsView: this.dependencies.WebContentsView,
        lastUsed: ++this.clock,
        request,
        state,
        url,
      })
      state.entries.set(request.tabId, entry)
      this.installEntryEvents(state, entry)
      this.load(state, entry, url)
    }
    entry.lastUsed = ++this.clock
    entry.bounds = clampWebTabBounds(request.bounds, owner.getContentBounds())
    entry.view.setBounds(entry.bounds)
    state.activeTabId = request.tabId
    this.updateActiveStates(state)
    if (entry.state.url !== url || entry.state.status === 'error') this.load(state, entry, url)
    else if (entry.ready) this.attach(state, entry)
    this.evictOverflow(state)
  }

  setBounds(owner: BrowserWindow, request: WebTabSetBoundsRequest): void {
    const entry = this.requireEntry(this.stateFor(owner), request.tabId)
    entry.bounds = clampWebTabBounds(request.bounds, owner.getContentBounds())
    entry.view.setBounds(entry.bounds)
  }

  hide(owner: BrowserWindow, request: WebTabIdRequest): void {
    const state = this.stateFor(owner)
    const entry = state.entries.get(request.tabId)
    if (!entry) return
    this.detach(state, entry)
    if (state.activeTabId === request.tabId) state.activeTabId = null
    this.updateActiveStates(state)
  }

  close(owner: BrowserWindow, request: WebTabIdRequest): void {
    const state = this.stateFor(owner)
    const entry = state.entries.get(request.tabId)
    if (!entry) return
    this.destroyEntry(state, entry, true)
  }

  navigate(owner: BrowserWindow, request: WebTabNavigateRequest): void {
    const state = this.stateFor(owner)
    this.load(state, this.requireEntry(state, request.tabId), normalizeWebTabUrl(request.url))
  }

  goBack(owner: BrowserWindow, request: WebTabIdRequest): void {
    const webContents = this.requireEntry(this.stateFor(owner), request.tabId).view.webContents
    if (webContents.canGoBack()) webContents.goBack()
  }

  goForward(owner: BrowserWindow, request: WebTabIdRequest): void {
    const webContents = this.requireEntry(this.stateFor(owner), request.tabId).view.webContents
    if (webContents.canGoForward()) webContents.goForward()
  }

  reload(owner: BrowserWindow, request: WebTabIdRequest): void {
    this.requireEntry(this.stateFor(owner), request.tabId).view.webContents.reload()
  }

  stop(owner: BrowserWindow, request: WebTabIdRequest): void {
    this.requireEntry(this.stateFor(owner), request.tabId).view.webContents.stop()
  }

  setShortcutBindings(owner: BrowserWindow, request: WebTabShortcutBindingsRequest): void {
    this.stateFor(owner).shortcuts = compileWebTabShortcutBindings(
      request.bindings,
      this.dependencies.platform ?? process.platform,
    )
  }

  private stateFor(owner: BrowserWindow): WebTabWindowState {
    this.registerWindow(owner)
    return this.windows.get(owner.id) as WebTabWindowState
  }

  private installEntryEvents(state: WebTabWindowState, entry: WebTabEntry): void {
    entry.cleanupEvents = installManagedWebTabEvents(state, entry, {
      detach: () => this.detach(state, entry),
      emit: (event) => this.emit(state, event),
      failed: (description, code) => this.markFailed(state, entry, description, code),
      loading: () => this.markLoading(state, entry),
      navigated: (url) => this.markNavigated(state, entry, url),
      ready: () => this.markReady(state, entry),
      stateChanged: () => this.emitState(state, entry),
    })
  }

  private load(state: WebTabWindowState, entry: WebTabEntry, url: string): void {
    const generation = ++entry.loadGeneration
    entry.state.url = url
    this.markLoading(state, entry)
    void entry.view.webContents.loadURL(url).catch((error: unknown) => {
      if (state.entries.get(entry.state.tabId) !== entry || entry.loadGeneration !== generation) {
        return
      }
      entry.state.status = 'error'
      const description = error instanceof Error ? error.message : 'Load failed'
      entry.state.error = { description: description.slice(0, MAX_ERROR_DESCRIPTION_LENGTH) }
      this.emitState(state, entry)
    })
  }

  private markLoading(state: WebTabWindowState, entry: WebTabEntry): void {
    entry.ready = false
    entry.state.status = 'loading'
    delete entry.state.error
    this.detach(state, entry)
    this.emitState(state, entry)
  }

  private markReady(state: WebTabWindowState, entry: WebTabEntry): void {
    entry.ready = true
    entry.state.status = 'ready'
    entry.state.title = entry.view.webContents.getTitle().slice(0, MAX_TITLE_LENGTH)
    updateWebTabHistory(entry)
    if (state.activeTabId === entry.state.tabId) this.attach(state, entry)
    this.emitState(state, entry)
  }

  private markNavigated(state: WebTabWindowState, entry: WebTabEntry, url: string): void {
    try {
      entry.state.url = normalizeWebTabUrl(url)
    } catch {
      return
    }
    updateWebTabHistory(entry)
    this.emitState(state, entry)
  }

  private markFailed(
    state: WebTabWindowState,
    entry: WebTabEntry,
    description: string,
    code?: number,
  ): void {
    entry.ready = false
    entry.state.status = code === undefined ? 'crashed' : 'error'
    entry.state.error = { code, description: description.slice(0, MAX_ERROR_DESCRIPTION_LENGTH) }
    this.detach(state, entry)
    this.emitState(state, entry)
  }

  private updateActiveStates(state: WebTabWindowState): void {
    updateWebTabActiveStates(state, (entry) => this.emitState(state, entry))
  }

  private attachActive(windowId: number): void {
    const state = this.windows.get(windowId)
    if (!state?.activeTabId) return
    const entry = state.entries.get(state.activeTabId)
    if (entry?.ready) this.attach(state, entry)
  }

  private detachActive(windowId: number): void {
    const state = this.windows.get(windowId)
    if (!state?.activeTabId) return
    const entry = state.entries.get(state.activeTabId)
    if (entry) this.detach(state, entry)
  }

  private attach(state: WebTabWindowState, entry: WebTabEntry): void {
    if (state.entries.get(entry.state.tabId) !== entry) return
    if (state.activeTabId !== entry.state.tabId) return
    if (!entry.ready || state.owner.isDestroyed()) return
    if (!state.owner.isVisible() || state.owner.isMinimized()) return
    attachWebTabView(state, entry)
  }

  private detach(state: WebTabWindowState, entry: WebTabEntry): void {
    detachWebTabView(state, entry)
  }

  private evictOverflow(state: WebTabWindowState): void {
    evictWebTabOverflow(state, MAX_CACHED_VIEWS, (entry) => this.emitState(state, entry))
  }

  private destroyEntry(state: WebTabWindowState, entry: WebTabEntry, emitClosed: boolean): void {
    destroyWebTabEntry(state, entry, {
      emitClosed,
      onStateChanged: (changed) => this.emitState(state, changed),
    })
  }

  private disposeWindow(windowId: number): void {
    const state = this.windows.get(windowId)
    if (!state) return
    disposeWebTabWindow(state, (entry) => this.destroyEntry(state, entry, false))
    this.windows.delete(windowId)
  }

  private requireEntry(state: WebTabWindowState, tabId: string): WebTabEntry {
    const entry = state.entries.get(tabId)
    if (!entry) throw new Error('Unknown web tab')
    entry.lastUsed = ++this.clock
    return entry
  }

  private emitState(state: WebTabWindowState, entry: WebTabEntry): void {
    this.emit(state, { state: { ...entry.state }, type: 'state' })
  }

  private emit(state: WebTabWindowState, event: Parameters<typeof sendWebTabEvent>[2]): void {
    sendWebTabEvent(state.owner, nativeIpcChannels.webTabsState, event)
  }
}
