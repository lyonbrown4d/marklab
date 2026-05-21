import Store from 'electron-store'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

import type { PersistedWindowState, RendererPersistKey } from '../types.js'

type SettingsSchema = {
  rendererPersist?: Partial<Record<RendererPersistKey, unknown>>
  windowState?: PersistedWindowState
}

const SETTINGS_STORE_NAME = 'settings'
const LEGACY_WINDOW_STATE_FILE = 'window-state.json'
const rendererPersistKeys = new Set<RendererPersistKey>(['marko.app'])

let settingsStore: Store<SettingsSchema> | null = null
let didMigrateLegacyWindowState = false

function getStore(): Store<SettingsSchema> {
  settingsStore ??= new Store<SettingsSchema>({ name: SETTINGS_STORE_NAME })
  return settingsStore
}

function assertRendererPersistKey(key: string): asserts key is RendererPersistKey {
  if (!rendererPersistKeys.has(key as RendererPersistKey)) {
    throw new Error(`Unsupported settings persist key: ${key}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizedNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

function normalizeWindowState(value: unknown): PersistedWindowState | null {
  if (!isRecord(value)) return null
  const width = normalizedNumber(value.width)
  const height = normalizedNumber(value.height)
  if (width === null || height === null) return null

  const x = normalizedNumber(value.x)
  const y = normalizedNumber(value.y)
  return {
    width,
    height,
    ...(x !== null ? { x } : {}),
    ...(y !== null ? { y } : {}),
    isMaximized: value.isMaximized === true,
  }
}

function legacyWindowStatePath(): string {
  return path.join(app.getPath('userData'), LEGACY_WINDOW_STATE_FILE)
}

function readLegacyWindowState(): PersistedWindowState | null {
  try {
    const statePath = legacyWindowStatePath()
    if (!fs.existsSync(statePath)) return null
    return normalizeWindowState(JSON.parse(fs.readFileSync(statePath, 'utf8')))
  } catch (error) {
    console.warn('Unable to read legacy window state.', error)
    return null
  }
}

function migrateLegacyWindowState(): void {
  if (didMigrateLegacyWindowState) return
  didMigrateLegacyWindowState = true
  const store = getStore()
  if (store.has('windowState')) return

  const legacyState = readLegacyWindowState()
  if (!legacyState) return

  store.set('windowState', legacyState)
}

export function getWindowState(): PersistedWindowState | null {
  migrateLegacyWindowState()
  return normalizeWindowState(getStore().get('windowState'))
}

export function setWindowState(state: PersistedWindowState): void {
  getStore().set('windowState', state)
}

export function getRendererPersistValue(key: string): unknown {
  assertRendererPersistKey(key)
  return getStore().get('rendererPersist')?.[key] ?? null
}

export function setRendererPersistValue(key: string, value: unknown): void {
  assertRendererPersistKey(key)
  const rendererPersist = getStore().get('rendererPersist') ?? {}
  getStore().set('rendererPersist', {
    ...rendererPersist,
    [key]: value,
  })
}

export function removeRendererPersistValue(key: string): void {
  assertRendererPersistKey(key)
  const rendererPersist = { ...(getStore().get('rendererPersist') ?? {}) }
  delete rendererPersist[key]
  getStore().set('rendererPersist', rendererPersist)
}
