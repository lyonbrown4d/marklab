import type { PersistStorage, StorageValue } from 'zustand/middleware'
import { z } from 'zod'
import type { DesktopCommandArgs } from '@/generated/desktop/bindings'
import { RENDERER_PERSIST_KEYS, type RendererPersistKey } from '@/types/persistenceKeys'
import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
type IdleHandle =
  | {
      kind: 'idle'
      id: number
    }
  | {
      kind: 'timeout'
      id: ReturnType<typeof globalThis.setTimeout>
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

type SettingsJsonValue = DesktopCommandArgs['settings_persist_set']['request']['value']
const settingsJsonValueSchema = z.json() satisfies z.ZodType<SettingsJsonValue>

const cloneJsonValue = (value: unknown): SettingsJsonValue => {
  const serialized = JSON.stringify(value)
  return serialized === undefined ? null : settingsJsonValueSchema.parse(JSON.parse(serialized))
}

export const createIdleJsonStorage = <S>(
  name: RendererPersistKey = RENDERER_PERSIST_KEYS.preferences,
): PersistStorage<S> | undefined => {
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
export const createDesktopSettingsJsonStorage = <S>(
  name: RendererPersistKey = RENDERER_PERSIST_KEYS.preferences,
): PersistStorage<S> | undefined => {
  const desktopPersist = isDesktopRuntime() ? getDesktopRuntime().settings.persist : undefined
  if (!desktopPersist) return createIdleJsonStorage<S>(name)
  const serializedValues = new Map<string, string>()
  const mutationEpochs = new Map<string, number>()
  const bumpMutationEpoch = (key: string) => {
    mutationEpochs.set(key, (mutationEpochs.get(key) ?? 0) + 1)
  }
  return {
    getItem: async (key) => {
      const mutationEpoch = mutationEpochs.get(key) ?? 0
      const value = await desktopPersist.getItem(key)
      if (value !== null && (mutationEpochs.get(key) ?? 0) === mutationEpoch) {
        serializedValues.set(key, JSON.stringify(value))
      }
      return value as StorageValue<S> | null
    },
    setItem: async (key, value) => {
      const cloned = cloneJsonValue(value)
      const serialized = JSON.stringify(cloned)
      if (serializedValues.get(key) === serialized) return
      bumpMutationEpoch(key)
      serializedValues.set(key, serialized)
      const result = await desktopPersist.setItem(key, cloned)
      if (result.ok) return
      if (serializedValues.get(key) === serialized) serializedValues.delete(key)
      throw new Error(result.error ?? 'Unable to persist settings.')
    },
    removeItem: async (key) => {
      bumpMutationEpoch(key)
      serializedValues.delete(key)
      const result = await desktopPersist.removeItem(key)
      if (!result.ok) throw new Error(result.error ?? 'Unable to remove persisted settings.')
    },
  }
}
