import { describe, expect, it, vi } from 'vitest'

import { nativeIpcChannels } from '@electron/channels'
import { registerWebTabsIpc } from '@electron/ipc/webTabs'

describe('web tabs IPC', () => {
  it('accepts main-frame requests from managed windows', () => {
    const fixture = createFixture()
    const request = {
      bounds: { height: 400, width: 600, x: 0, y: 40 },
      tabId: 'docs',
      url: 'https://example.com',
    }

    expect(
      fixture.handlers.get(nativeIpcChannels.webTabsActivate)?.(fixture.event, request),
    ).toEqual({ ok: true })
    expect(fixture.workspaceRegistry.serviceForWebContents).toHaveBeenCalledWith(
      fixture.event.sender,
    )
    expect(fixture.manager.activate).toHaveBeenCalledWith(fixture.window, request)
  })

  it('rejects subframes and unmanaged senders', () => {
    const fixture = createFixture()
    expect(() =>
      fixture.handlers.get(nativeIpcChannels.webTabsHide)?.(
        { ...fixture.event, senderFrame: {} },
        { tabId: 'docs' },
      ),
    ).toThrow('main frame')
    expect(fixture.workspaceRegistry.serviceForWebContents).not.toHaveBeenCalled()

    const unmanaged = createFixture(false)
    expect(() =>
      unmanaged.handlers.get(nativeIpcChannels.webTabsHide)?.(unmanaged.event, { tabId: 'docs' }),
    ).toThrow('managed window')
  })

  it('registers every typed command', () => {
    const fixture = createFixture()
    expect([...fixture.handlers.keys()]).toEqual([
      nativeIpcChannels.webTabsActivate,
      nativeIpcChannels.webTabsSetBounds,
      nativeIpcChannels.webTabsHide,
      nativeIpcChannels.webTabsClose,
      nativeIpcChannels.webTabsNavigate,
      nativeIpcChannels.webTabsGoBack,
      nativeIpcChannels.webTabsGoForward,
      nativeIpcChannels.webTabsReload,
      nativeIpcChannels.webTabsStop,
      nativeIpcChannels.webTabsSetShortcutBindings,
    ])
  })
})

const createFixture = (managed = true) => {
  type TestIpcEvent = { sender: { mainFrame: object }; senderFrame: object }
  const handlers = new Map<string, (event: TestIpcEvent, payload: unknown) => unknown>()
  const ipcMain = { handle: vi.fn((channel, handler) => handlers.set(channel, handler)) }
  const manager = {
    activate: vi.fn(),
    close: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    hide: vi.fn(),
    navigate: vi.fn(),
    reload: vi.fn(),
    setBounds: vi.fn(),
    stop: vi.fn(),
    setShortcutBindings: vi.fn(),
  }
  const window = { id: 4, isDestroyed: vi.fn(() => false) }
  const sender = { mainFrame: {} }
  const event = { sender, senderFrame: sender.mainFrame }
  const workspaceRegistry = {
    isManagedWebContents: vi.fn(() => managed),
    serviceForWebContents: vi.fn(() => ({})),
  }
  const BrowserWindow = { fromWebContents: vi.fn(() => window) }
  registerWebTabsIpc(ipcMain as never, {
    BrowserWindow: BrowserWindow as never,
    manager: manager as never,
    workspaceRegistry: workspaceRegistry as never,
  })
  return { event, handlers, manager, window, workspaceRegistry }
}
