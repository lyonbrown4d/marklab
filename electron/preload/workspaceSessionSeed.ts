import type { IpcRenderer } from 'electron'
import type { PersistedRendererValue } from '@electron/services/settingsStoreSchemas'

type SeedListener = (seed: PersistedRendererValue) => void

const isSessionSeed = (value: unknown): value is PersistedRendererValue => {
  if (!value || typeof value !== 'object') return false
  const seed = value as Record<string, unknown>
  return (
    seed.state !== null &&
    typeof seed.state === 'object' &&
    !Array.isArray(seed.state) &&
    (seed.version === undefined ||
      (typeof seed.version === 'number' && Number.isFinite(seed.version)))
  )
}

export const createWorkspaceSessionSeedSubscription = (renderer: Pick<IpcRenderer, 'on'>) => {
  let latestSeed: PersistedRendererValue | null = null
  const listeners = new Set<SeedListener>()
  // Native opens can arrive before the renderer bundle finishes loading and subscribes.
  // Retain only the latest workspace target, just as window-opening progress is retained.
  renderer.on('workspace-session-seed', (_event, payload: unknown) => {
    if (!isSessionSeed(payload)) return
    latestSeed = payload
    for (const listener of listeners) listener(payload)
  })

  return (listener: SeedListener): (() => void) => {
    listeners.add(listener)
    if (latestSeed) listener(latestSeed)
    return () => {
      listeners.delete(listener)
    }
  }
}
