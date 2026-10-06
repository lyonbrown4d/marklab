import { rendererPersistKeys } from '@electron/services/settingsPersistKeys'
import { SettingsStore } from '@electron/services/settingsStoreService'
import type { PersistedRendererValue } from '@electron/services/settingsStoreSchemas'
import type { PersistedWindowState, RendererPersistKey } from '@electron/types'

export { SettingsStore } from '@electron/services/settingsStoreService'

let configuredStore: SettingsStore | null = null

export const configureSettingsStore = (settingsStore: SettingsStore): SettingsStore => {
  configuredStore = settingsStore
  return configuredStore
}

const store = (): SettingsStore => {
  if (!configuredStore) throw new Error('Settings store is not configured')
  return configuredStore
}

const persistKey = (key: string): RendererPersistKey => {
  if (!rendererPersistKeys.has(key as RendererPersistKey)) {
    throw new Error(`Unsupported settings persist key: ${key}`)
  }
  return key as RendererPersistKey
}

export const getWindowState = (): PersistedWindowState | null => store().getWindowState()

export const setWindowState = (state: PersistedWindowState): void => store().setWindowState(state)

export const getRendererPersistValue = (key: string, sessionKey?: string | null): unknown =>
  store().getRendererPersistValue(persistKey(key), sessionKey)

export const setRendererPersistValue = (
  key: string,
  value: unknown,
  sessionKey?: string | null,
): void => store().setRendererPersistValue(persistKey(key), value, sessionKey)

export const removeRendererPersistValue = (key: string, sessionKey?: string | null): void =>
  store().removeRendererPersistValue(persistKey(key), sessionKey)

export const writeRendererPersistSession = (
  key: string,
  sessionKey: string | undefined | null,
  state: Record<string, unknown>,
  version?: number,
): PersistedRendererValue =>
  store().writeRendererPersistSession(persistKey(key), sessionKey, state, version)

export const copyRendererPersistSession = (
  key: string,
  sourceSessionKey: string | undefined | null,
  targetSessionKey: string | undefined | null,
  overrides: Record<string, unknown> = {},
): PersistedRendererValue | null =>
  store().copyRendererPersistSession(persistKey(key), sourceSessionKey, targetSessionKey, overrides)

export const removeRendererSession = (sessionKey: string | undefined | null): void =>
  store().removeRendererSession(sessionKey)
