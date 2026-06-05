import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { getElectronRuntime } from '@/runtime/electron'
type IdleHandle =
  | {
      kind: 'idle'
      id: number
    }
  | {
      kind: 'timeout'
      id: number
    }
const scheduleIdle = (callback: () => void): IdleHandle => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return {
      kind: 'idle',
      id: window.requestIdleCallback(callback, { timeout: 1000 }),
    }
  }
  return { kind: 'timeout', id: globalThis.setTimeout(callback, 120) }
}
const cancelIdle = (handle: IdleHandle | null) => {
  if (!handle || typeof window === 'undefined') return
  if (handle.kind === 'idle' && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(handle.id)
    return
  }
  globalThis.clearTimeout(handle.id)
}
export const createIdleJsonStorage = <S>(name = 'marko.app'): PersistStorage<S> | undefined => {
  if (typeof window === 'undefined') return undefined
  let storage: Storage
  try {
    storage = window.localStorage
  } catch {
    return undefined
  }
  const pending = new Map<string, StorageValue<S>>()
  let scheduledFlush: IdleHandle | null = null
  let listenersInstalled = false
  const flush = () => {
    scheduledFlush = null
    if (pending.size === 0) return
    const entries = Array.from(pending.entries())
    pending.clear()
    entries.forEach(([key, value]) => {
      storage.setItem(key, JSON.stringify(value))
    })
  }
  const ensureFlushListeners = () => {
    if (listenersInstalled) return
    listenersInstalled = true
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush()
      }
    })
  }
  const scheduleFlush = () => {
    ensureFlushListeners()
    if (scheduledFlush) return
    scheduledFlush = scheduleIdle(flush)
  }
  return {
    getItem: (key) => {
      const pendingValue = pending.get(key)
      if (pendingValue) return pendingValue
      const value = storage.getItem(key)
      if (!value) return null
      try {
        return JSON.parse(value) as StorageValue<S>
      } catch {
        storage.removeItem(key)
        return null
      }
    },
    setItem: (key, value) => {
      pending.set(key, value)
      scheduleFlush()
    },
    removeItem: (key) => {
      pending.delete(key)
      if (key === name) {
        cancelIdle(scheduledFlush)
        scheduledFlush = null
      }
      storage.removeItem(key)
    },
  }
}
export const createElectronSettingsJsonStorage = <S>(
  name = 'marko.app',
): PersistStorage<S> | undefined => {
  const electronPersist = getElectronRuntime()?.settings?.persist
  if (!electronPersist) return createIdleJsonStorage<S>(name)
  return {
    getItem: async (key) => {
      const value = await electronPersist.getItem(key)
      return value as StorageValue<S> | null
    },
    setItem: async (key, value) => {
      const result = await electronPersist.setItem(key, value)
      if (!result.ok) throw new Error(result.error ?? 'Unable to persist settings.')
    },
    removeItem: async (key) => {
      const result = await electronPersist.removeItem(key)
      if (!result.ok) throw new Error(result.error ?? 'Unable to remove persisted settings.')
    },
  }
}
