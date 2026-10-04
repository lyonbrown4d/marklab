import { EventEmitter } from 'node:events'
import { vi } from 'vitest'

import { WebTabManager } from '@electron/services/webTabs/webTabManager.js'

export const keyInput = (key: string): Electron.Input => ({
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

export const request = (tabId: string) => ({
  bounds: { height: 600, width: 1000, x: -20, y: 80 },
  tabId,
  url: 'https://example.com',
})

export const createFixture = () => {
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

export const createFakeWindow = (id: number) =>
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
