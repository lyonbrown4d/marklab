import { EventEmitter } from 'node:events'
import type { IpcMain, WebContents } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nativeIpcChannels } from '@electron/channels'
import { registerRecentWorkspaceWatchIpc } from '@electron/ipc/recentWorkspaceWatch'
import { onRecentWorkspacesChanged } from '@electron/services/settingsStore'

vi.mock('@electron/services/settingsStore', () => ({ onRecentWorkspacesChanged: vi.fn() }))

const sender = () =>
  Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: vi.fn(() => false),
    send: vi.fn(),
  }) as unknown as WebContents &
    EventEmitter & { isDestroyed: ReturnType<typeof vi.fn<() => boolean>> }

const harness = () => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const listeners: (() => void)[] = [],
    stops: ReturnType<typeof vi.fn>[] = []
  vi.mocked(onRecentWorkspacesChanged).mockImplementation((listener) => {
    listeners.push(listener)
    const stop = vi.fn()
    stops.push(stop)
    return stop
  })
  const registry = { sessionKeyForWebContents: vi.fn(() => 'managed-window') }
  registerRecentWorkspaceWatchIpc(
    {
      handle: (channel: string, handler: Parameters<IpcMain['handle']>[1]) => {
        handlers.set(channel, handler as (...args: unknown[]) => unknown)
      },
      on: (channel: string, handler: Parameters<IpcMain['on']>[1]) => {
        handlers.set(channel, handler as (...args: unknown[]) => unknown)
      },
    } as unknown as IpcMain,
    registry,
  )
  const invoke = (owner: WebContents, id: unknown, frame: unknown = owner.mainFrame) =>
    handlers.get(nativeIpcChannels.recentWorkspacesWatchStart)!(
      { sender: owner, senderFrame: frame },
      id,
    )
  const stop = (owner: WebContents, id: unknown) =>
    handlers.get(nativeIpcChannels.recentWorkspacesWatchStop)!({ sender: owner }, id)
  return { invoke, stop, stops, listeners, registry }
}

describe('recent workspace watch IPC ownership', () => {
  beforeEach(() => vi.clearAllMocks())
  it('sends changes to subscribing windows and releases only the requested subscription', () => {
    const { invoke, stop, stops, listeners } = harness()
    const first = sender(),
      second = sender()
    expect(invoke(first, 1)).toEqual({ ok: true })
    invoke(second, 1)
    listeners[0]()
    listeners[1]()
    expect(first.send).toHaveBeenCalledWith(nativeIpcChannels.recentWorkspacesChanged)
    expect(second.send).toHaveBeenCalledWith(nativeIpcChannels.recentWorkspacesChanged)
    stop(first, 1)
    expect(stops[0]).toHaveBeenCalledOnce()
    expect(stops[1]).not.toHaveBeenCalled()
    first.emit('destroyed')
    second.emit('destroyed')
    expect(stops[1]).toHaveBeenCalledOnce()
  })
  it('replaces duplicate subscription IDs and ignores unknown or malformed stops', () => {
    const { invoke, stop, stops } = harness()
    const owner = sender()
    invoke(owner, 1)
    invoke(owner, 1)
    invoke(owner, 2)
    expect(stops[0]).toHaveBeenCalledOnce()
    stop(sender(), 1)
    stop(owner, 'bad')
    stop(owner, 42)
    expect(stops[1]).not.toHaveBeenCalled()
    owner.emit('destroyed')
    expect(stops[1]).toHaveBeenCalledOnce()
    expect(stops[2]).toHaveBeenCalledOnce()
    expect(owner.listenerCount('did-start-navigation')).toBe(0)
  })
  it('releases subscriptions on renderer navigation and can subscribe the reloaded renderer again', () => {
    const { invoke, stops } = harness()
    const owner = sender()
    invoke(owner, 1)
    owner.emit('did-start-navigation', {}, '', false, false)
    expect(stops[0]).not.toHaveBeenCalled()
    owner.emit('did-start-navigation', {}, '', false, true)
    expect(stops[0]).toHaveBeenCalledOnce()
    invoke(owner, 1)
    owner.emit('destroyed')
    expect(stops[1]).toHaveBeenCalledOnce()
    expect(owner.listenerCount('did-start-navigation')).toBe(0)
  })
  it.each([null, {}, 0, -1, 1.5, '1'])('rejects invalid subscription ID %j', (id) => {
    const { invoke } = harness()
    expect(() => invoke(sender(), id)).toThrow('Invalid history watch subscription')
    expect(onRecentWorkspacesChanged).not.toHaveBeenCalled()
  })
  it('rejects unmanaged senders, subframes and destroyed windows', () => {
    const { invoke, registry } = harness()
    const owner = sender()
    registry.sessionKeyForWebContents.mockImplementationOnce(() => {
      throw new Error('unmanaged')
    })
    expect(() => invoke(owner, 1)).toThrow('unmanaged')
    expect(() => invoke(owner, 1, {})).toThrow('main frame')
    owner.isDestroyed.mockReturnValue(true)
    expect(() => invoke(owner, 1)).toThrow('Workspace window is closed')
    expect(onRecentWorkspacesChanged).not.toHaveBeenCalled()
  })
  it('ignores late changes for a destroyed window', () => {
    const { invoke, listeners } = harness()
    const owner = sender()
    invoke(owner, 1)
    owner.isDestroyed.mockReturnValue(true)
    owner.emit('destroyed')
    listeners[0]()
    expect(owner.send).not.toHaveBeenCalled()
  })
})
