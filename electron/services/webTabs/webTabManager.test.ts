import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

import { WebTabManager } from '@electron/services/webTabs/webTabManager.js'

describe('WebTabManager', () => {
  it('creates a hardened temporary view and clamps it to the content area', () => {
    const fixture = createFixture()
    fixture.manager.activate(fixture.window as never, request('docs'))

    expect(fixture.createdOptions[0]).toEqual({
      webPreferences: {
        allowRunningInsecureContent: false,
        contextIsolation: true,
        devTools: false,
        disableDialogs: true,
        nodeIntegration: false,
        partition: 'marklab-web-tabs-7',
        preload: undefined,
        sandbox: true,
        webSecurity: true,
        webviewTag: false,
      },
    })
    expect(fixture.views[0].bounds).toEqual({ height: 520, width: 900, x: 0, y: 80 })
    expect(fixture.window.contentView.addChildView).not.toHaveBeenCalled()
    fixture.views[0].webContents.getTitle.mockReturnValue('x'.repeat(700))
    fixture.views[0].webContents.emit('did-finish-load')
    expect(fixture.window.contentView.addChildView).toHaveBeenCalledWith(fixture.views[0])
    expect(fixture.views[0].webContents.focus).not.toHaveBeenCalled()
    expect(fixture.views[0].webContents.loadURL).toHaveBeenCalledWith('https://example.com/')
    expect(fixture.window.webContents.send).toHaveBeenLastCalledWith(
      'marklab:web-tabs:state',
      expect.objectContaining({ state: expect.objectContaining({ title: 'x'.repeat(512) }) }),
    )
  })

  it('keeps one active view and evicts the least recently used view above three', () => {
    const fixture = createFixture()
    const activate = (tabId: string) => {
      fixture.manager.activate(fixture.window as never, request(tabId))
      fixture.views.at(-1)?.webContents.emit('did-finish-load')
    }

    activate('one')
    activate('two')
    activate('three')
    activate('one')
    activate('four')

    expect(fixture.views[1].webContents.close).toHaveBeenCalledOnce()
    expect(fixture.views[0].webContents.close).not.toHaveBeenCalled()
    expect(fixture.window.contentView.removeChildView).toHaveBeenCalled()
    expect(fixture.views[2].visible).toBe(false)
  })

  it('denies permissions, downloads, display capture, and new windows', () => {
    const fixture = createFixture()
    fixture.manager.activate(fixture.window as never, request('docs'))
    const view = fixture.views[0]

    expect(view.webContents.session.permissionCheckHandler()).toBe(false)
    const permissionCallback = vi.fn()
    view.webContents.session.permissionRequestHandler({}, 'camera', permissionCallback)
    expect(permissionCallback).toHaveBeenCalledWith(false)
    expect(view.webContents.session.devicePermissionHandler()).toBe(false)
    const displayCallback = vi.fn()
    view.webContents.session.displayMediaRequestHandler({}, displayCallback)
    expect(displayCallback).toHaveBeenCalledWith({})
    const downloadEvent = { preventDefault: vi.fn() }
    view.webContents.session.emit('will-download', downloadEvent)
    expect(downloadEvent.preventDefault).toHaveBeenCalledOnce()

    expect(view.webContents.openHandler({ url: 'https://popup.example.com' })).toEqual({
      action: 'deny',
    })
    expect(fixture.window.webContents.send).toHaveBeenCalledWith(
      'marklab:web-tabs:state',
      expect.objectContaining({ type: 'open-requested' }),
    )
  })

  it('revalidates navigations and destroys every view when the owner closes', () => {
    const fixture = createFixture()
    fixture.manager.activate(fixture.window as never, request('docs'))
    const view = fixture.views[0]
    const navigation = { preventDefault: vi.fn() }
    view.webContents.emit('will-navigate', navigation, 'file:///tmp/private.md')
    expect(navigation.preventDefault).toHaveBeenCalledOnce()

    fixture.window.emit('closed')
    expect(view.webContents.close).toHaveBeenCalledOnce()
  })

  it('does not attach a view that was hidden or closed before loading finished', () => {
    const hidden = createFixture()
    hidden.manager.activate(hidden.window as never, request('docs'))
    hidden.manager.hide(hidden.window as never, { tabId: 'docs' })
    hidden.views[0].webContents.emit('did-finish-load')
    expect(hidden.window.contentView.addChildView).not.toHaveBeenCalled()

    const closed = createFixture()
    closed.manager.activate(closed.window as never, request('docs'))
    closed.manager.close(closed.window as never, { tabId: 'docs' })
    closed.views[0].webContents.emit('did-finish-load')
    expect(closed.window.contentView.addChildView).not.toHaveBeenCalled()
    expect(closed.views[0].webContents.listenerCount('before-input-event')).toBe(0)
  })

  it('forwards configured app shortcuts and detaches only for overlay actions', () => {
    const fixture = createFixture()
    fixture.manager.setShortcutBindings(fixture.window as never, {
      bindings: {
        'app.commandPalette': ['Mod+P'],
        'view.toggleTerminal': ['Mod+J'],
      },
    })
    fixture.manager.activate(fixture.window as never, request('docs'))
    const view = fixture.views[0]
    view.webContents.emit('did-finish-load')

    const terminalEvent = { preventDefault: vi.fn() }
    view.webContents.emit('before-input-event', terminalEvent, keyInput('j'))
    expect(terminalEvent.preventDefault).toHaveBeenCalledOnce()
    expect(view.visible).toBe(true)
    expect(fixture.window.webContents.focus).toHaveBeenCalled()
    expect(fixture.window.webContents.send).toHaveBeenLastCalledWith('marklab:web-tabs:state', {
      action: 'view.toggleTerminal',
      tabId: 'docs',
      type: 'shortcut',
    })

    const paletteEvent = { preventDefault: vi.fn() }
    view.webContents.emit('before-input-event', paletteEvent, keyInput('p'))
    expect(paletteEvent.preventDefault).toHaveBeenCalledOnce()
    expect(view.visible).toBe(false)
  })

  it('does not intercept web editing, IME, or repeated input', () => {
    const fixture = createFixture()
    fixture.manager.setShortcutBindings(fixture.window as never, {
      bindings: { 'app.settings': ['Mod+C', 'Mod+P'] },
    })
    fixture.manager.activate(fixture.window as never, request('docs'))
    const contents = fixture.views[0].webContents
    const editingEvent = { preventDefault: vi.fn() }
    contents.emit('before-input-event', editingEvent, keyInput('c'))
    contents.emit('before-input-event', editingEvent, {
      ...keyInput('p'),
      isComposing: true,
    })
    contents.emit('before-input-event', editingEvent, {
      ...keyInput('p'),
      isAutoRepeat: true,
    })
    expect(editingEvent.preventDefault).not.toHaveBeenCalled()
  })

  it('ignores an aborted stale navigation after a newer navigation starts', async () => {
    const fixture = createFixture()
    fixture.manager.activate(fixture.window as never, request('docs'))
    const contents = fixture.views[0].webContents
    let rejectStale!: (error: Error) => void
    contents.loadURL.mockImplementationOnce(
      () =>
        new Promise<undefined>((_resolve, reject) => {
          rejectStale = reject
        }),
    )
    contents.loadURL.mockImplementationOnce(async () => undefined)

    fixture.manager.navigate(fixture.window as never, {
      tabId: 'docs',
      url: 'https://stale.example.com',
    })
    fixture.manager.navigate(fixture.window as never, {
      tabId: 'docs',
      url: 'https://current.example.com',
    })
    rejectStale(new Error('ERR_ABORTED'))
    await Promise.resolve()
    await Promise.resolve()

    expect(fixture.window.webContents.send).not.toHaveBeenCalledWith(
      'marklab:web-tabs:state',
      expect.objectContaining({ state: expect.objectContaining({ status: 'error' }) }),
    )
  })

  it('isolates shortcut bindings between windows with the same tab id', () => {
    const fixture = createFixture()
    const secondWindow = createFakeWindow(8)
    fixture.manager.setShortcutBindings(fixture.window as never, {
      bindings: { 'view.toggleTerminal': ['Mod+K'] },
    })
    fixture.manager.setShortcutBindings(secondWindow as never, {
      bindings: { 'app.settings': ['Mod+K'] },
    })
    fixture.manager.activate(fixture.window as never, request('docs'))
    fixture.manager.activate(secondWindow as never, request('docs'))
    fixture.views[0].webContents.emit('did-finish-load')
    fixture.views[1].webContents.emit('did-finish-load')

    fixture.views[0].webContents.emit(
      'before-input-event',
      { preventDefault: vi.fn() },
      keyInput('k'),
    )
    expect(fixture.window.webContents.send).toHaveBeenLastCalledWith('marklab:web-tabs:state', {
      action: 'view.toggleTerminal',
      tabId: 'docs',
      type: 'shortcut',
    })
    expect(secondWindow.webContents.send).not.toHaveBeenCalledWith(
      'marklab:web-tabs:state',
      expect.objectContaining({ type: 'shortcut' }),
    )
  })
})

const keyInput = (key: string): Electron.Input => ({
  alt: false,
  code: `Key${key.toUpperCase()}`,
  control: true,
  isAutoRepeat: false,
  isComposing: false,
  key,
  location: 0,
  meta: false,
  modifiers: ['control'],
  shift: false,
  type: 'keyDown',
})

const request = (tabId: string) => ({
  bounds: { height: 600, width: 1000, x: -20, y: 80 },
  tabId,
  url: 'https://example.com',
})

const createFixture = () => {
  const views: FakeView[] = []
  const createdOptions: unknown[] = []
  class FakeWebContentsView extends EventEmitter {
    bounds = { height: 0, width: 0, x: 0, y: 0 }
    visible = true
    webContents = new FakeWebContents()
    constructor(options: unknown) {
      super()
      createdOptions.push(options)
      views.push(this as unknown as FakeView)
    }
    setBounds = vi.fn((bounds) => {
      this.bounds = bounds
    })
    setVisible = vi.fn((visible: boolean) => {
      this.visible = visible
    })
  }
  const window = createFakeWindow(7)
  return {
    createdOptions,
    manager: new WebTabManager({
      platform: 'win32',
      WebContentsView: FakeWebContentsView as never,
    }),
    views,
    window,
  }
}

const createFakeWindow = (id: number) =>
  Object.assign(new EventEmitter(), {
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
    getContentBounds: vi.fn(() => ({ height: 600, width: 900, x: 50, y: 50 })),
    id,
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    webContents: { focus: vi.fn(), isDestroyed: vi.fn(() => false), send: vi.fn() },
  })

class FakeSession extends EventEmitter {
  permissionCheckHandler = vi.fn()
  permissionRequestHandler = vi.fn()
  devicePermissionHandler = vi.fn()
  displayMediaRequestHandler = vi.fn()
  setPermissionCheckHandler = vi.fn((handler) => (this.permissionCheckHandler = handler))
  setPermissionRequestHandler = vi.fn((handler) => (this.permissionRequestHandler = handler))
  setDevicePermissionHandler = vi.fn((handler) => (this.devicePermissionHandler = handler))
  setDisplayMediaRequestHandler = vi.fn((handler) => (this.displayMediaRequestHandler = handler))
}

class FakeWebContents extends EventEmitter {
  session = new FakeSession()
  close = vi.fn()
  isDestroyed = vi.fn(() => false)
  loadURL = vi.fn(async () => undefined)
  setAudioMuted = vi.fn()
  setBackgroundThrottling = vi.fn()
  openHandler = vi.fn()
  setWindowOpenHandler = vi.fn((handler) => (this.openHandler = handler))
  canGoBack = vi.fn(() => false)
  canGoForward = vi.fn(() => false)
  getTitle = vi.fn(() => 'Docs')
  getURL = vi.fn(() => 'https://example.com/')
  focus = vi.fn()
  goBack = vi.fn()
  goForward = vi.fn()
  reload = vi.fn()
  stop = vi.fn()
}

type FakeView = {
  bounds: { height: number; width: number; x: number; y: number }
  visible: boolean
  webContents: FakeWebContents
}
