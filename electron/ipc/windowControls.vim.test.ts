import type { BrowserWindow, IpcMain, IpcMainInvokeEvent } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels'
import { registerWindowControlsIpc } from '@electron/ipc/windowControls'

const harness = () => {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, active: unknown) => unknown>()
  const setIgnoreMenuShortcuts = vi.fn()
  const window = { isDestroyed: () => false, webContents: { setIgnoreMenuShortcuts } }
  const fromWebContents = vi.fn(() => window)
  registerWindowControlsIpc(
    {
      handle: (channel: string, handler: Parameters<IpcMain['handle']>[1]) =>
        handlers.set(channel, handler as never),
    } as unknown as IpcMain,
    { fromWebContents } as unknown as typeof BrowserWindow,
  )
  const mainFrame = {}
  const event = { senderFrame: mainFrame, sender: { mainFrame } } as IpcMainInvokeEvent
  const invoke = (active: unknown, request = event) =>
    handlers.get(nativeIpcChannels.windowSetVimKeyboardOwnership)?.(request, active)
  return { invoke, event, fromWebContents, setIgnoreMenuShortcuts }
}

describe('Vim keyboard ownership IPC', () => {
  it('changes only the requesting window, and restores shortcuts on release', () => {
    const test = harness()
    expect(test.invoke(true)).toEqual({ ok: true })
    expect(test.invoke(false)).toEqual({ ok: true })
    expect(test.fromWebContents).toHaveBeenCalledWith(test.event.sender)
    expect(test.setIgnoreMenuShortcuts.mock.calls).toEqual([[true], [false]])
  })
  it.each([null, 'true', 1, {}])('rejects invalid ownership payload %s', (active) => {
    const test = harness()
    expect(test.invoke(active)).toMatchObject({ ok: false })
    expect(test.setIgnoreMenuShortcuts).not.toHaveBeenCalled()
  })
  it('rejects child frame requests before resolving a window', () => {
    const test = harness()
    expect(
      test.invoke(true, { ...test.event, senderFrame: {} } as IpcMainInvokeEvent),
    ).toMatchObject({ ok: false })
    expect(test.fromWebContents).not.toHaveBeenCalled()
  })
})
