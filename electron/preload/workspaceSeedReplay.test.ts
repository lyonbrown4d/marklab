import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RendererSafeElectronApi } from '@/runtime/electron'

const bridge = vi.hoisted(() => {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()
  return {
    contextBridge: { exposeInMainWorld: vi.fn() },
    ipcRenderer: {
      invoke: vi.fn(),
      on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        const callbacks = listeners.get(channel) ?? new Set()
        callbacks.add(listener)
        listeners.set(channel, callbacks)
      }),
      removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
        listeners.get(channel)?.delete(listener)
      }),
    },
    emit: (payload: unknown) => {
      for (const callback of [...(listeners.get('workspace-session-seed') ?? [])]) {
        callback({}, payload)
      }
    },
    reset: () => listeners.clear(),
  }
})

vi.mock('electron', () => bridge)

const singleFile = {
  state: { rootKind: 'single', rootPath: '/notes/explicit.md', tabs: [], activeTabId: null },
  version: 1,
}

const loadPreload = async () => {
  await import('@electron/preload')
  return bridge.contextBridge.exposeInMainWorld.mock.calls[0]![1] as RendererSafeElectronApi
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  bridge.reset()
})

describe('workspace seed delivery through the actual preload bridge', () => {
  it('retains a native single-file target received before the renderer subscribes', async () => {
    const api = await loadPreload()
    bridge.emit(singleFile)
    const listener = vi.fn()
    api.events.listen('workspace-session-seed', listener)

    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ event: 'workspace-session-seed', payload: singleFile }),
    )
  })

  it('replays only the latest target and stops live delivery after unsubscribe', async () => {
    const api = await loadPreload()
    bridge.emit({ state: { rootKind: 'external', rootPath: '/old' } })
    bridge.emit(singleFile)
    const listener = vi.fn()
    const unsubscribe = await api.events.listen('workspace-session-seed', listener)
    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ payload: singleFile }),
    )

    const next = { state: { rootKind: 'single', rootPath: '/notes/second.md' } }
    bridge.emit(next)
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ payload: next }))
    unsubscribe()
    bridge.emit(singleFile)
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('ignores invalid payloads without losing the latest valid target', async () => {
    const api = await loadPreload()
    bridge.emit(singleFile)
    for (const value of [null, {}, { state: [] }, { state: {}, version: 'invalid' }]) {
      bridge.emit(value)
    }
    const listener = vi.fn()
    api.events.listen('workspace-session-seed', listener)
    expect(listener).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ payload: singleFile }),
    )
    bridge.emit({ state: null })
    expect(listener).toHaveBeenCalledOnce()
  })
})
