import Store from 'electron-store'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { noopLogger, type Logger } from '@electron/services/logger.js'
import {
  rendererSettingsStateKeys,
  rendererPersistKeys,
  workspaceRecentProjectsStateKeys,
  workspaceSessionStateKeys,
} from '@electron/services/settingsPersistKeys.js'
import type { PersistedWindowState, RendererPersistKey } from '@electron/types.js'

type SettingsSchema = {
  rendererPersist?: Partial<Record<RendererPersistKey, unknown>>
}

export type PersistedRendererValue = {
  state?: Record<string, unknown>
  version?: number
}

type PersistedSessionFile = {
  sessions: Record<string, PersistedRendererValue>
}

const SETTINGS_STORE_NAME = 'settings'
const DEFAULT_SESSION_KEY = 'main'
const STATE_DIR = 'state'
const APP_SESSION_FILE = 'app-session.json'
const RECENT_PROJECTS_FILE = 'recent-projects.json'
const WINDOW_STATE_FILE = 'window-state.json'
let settingsStore: Store<SettingsSchema> | null = null
let logger: Logger = noopLogger

export const configureSettingsStoreLogger = (nextLogger: Logger): void => {
  logger = nextLogger
}

const getStore = (): Store<SettingsSchema> => {
  settingsStore ??= new Store<SettingsSchema>({ name: SETTINGS_STORE_NAME })
  return settingsStore
}

const assertRendererPersistKey: (key: string) => asserts key is RendererPersistKey = (key) => {
  if (!rendererPersistKeys.has(key as RendererPersistKey)) {
    throw new Error(`Unsupported settings persist key: ${key}`)
  }
}

const assertWorkspacePersistKey = (key: RendererPersistKey): void => {
  if (key !== 'marklab.workspace') {
    throw new Error(`Unsupported workspace session persist key: ${key}`)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

const normalizePersistedRendererValue = (value: unknown): PersistedRendererValue | null => {
  if (!isRecord(value)) return null
  const state = isRecord(value.state) ? value.state : {}
  const rawVersion = value.version
  const version =
    typeof rawVersion === 'number' && Number.isFinite(rawVersion)
      ? Math.trunc(rawVersion)
      : undefined
  return {
    state,
    ...(version !== undefined ? { version } : {}),
  }
}

const normalizedNumber = (value: unknown): number | null => {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null
}

const normalizeWindowState = (value: unknown): PersistedWindowState | null => {
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

const userDataPath = (...segments: string[]): string => {
  return path.join(app.getPath('userData'), ...segments)
}

const statePath = (fileName: string): string => {
  return userDataPath(STATE_DIR, fileName)
}

const readJsonFile = <T>(filePath: string, normalize: (value: unknown) => T | null): T | null => {
  try {
    if (!fs.existsSync(filePath)) return null
    return normalize(JSON.parse(fs.readFileSync(filePath, 'utf8')))
  } catch (error) {
    logger.warn('unable to read persisted json file', { error, path: filePath })
    return null
  }
}

const writeJsonFile = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

const removeJsonFile = (filePath: string): void => {
  try {
    if (fs.existsSync(filePath)) fs.writeFileSync(filePath, 'null\n')
  } catch (error) {
    logger.warn('unable to remove persisted json file', { error, path: filePath })
  }
}

const persistedWindowStatePath = (): string => {
  return statePath(WINDOW_STATE_FILE)
}

const appSessionPath = (): string => {
  return statePath(APP_SESSION_FILE)
}

const recentProjectsPath = (): string => {
  return statePath(RECENT_PROJECTS_FILE)
}

const normalizeSessionKey = (sessionKey?: string | null): string => {
  return sessionKey && sessionKey.trim() ? sessionKey : DEFAULT_SESSION_KEY
}

const pickState = (state: Record<string, unknown>, keys: Set<string>): Record<string, unknown> => {
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(state)) {
    if (keys.has(key)) next[key] = value
  }
  return next
}

const rendererPersistValue = (
  state: Record<string, unknown>,
  version?: number,
): PersistedRendererValue => ({
  state,
  ...(version !== undefined ? { version } : {}),
})

const readRendererPersistFile = (filePath: string): PersistedRendererValue | null => {
  return readJsonFile(filePath, normalizePersistedRendererValue)
}

const normalizeSessionFile = (value: unknown): PersistedSessionFile | null => {
  if (!isRecord(value) || !isRecord(value.sessions)) return { sessions: {} }
  const sessions: Record<string, PersistedRendererValue> = {}
  for (const [sessionKey, sessionValue] of Object.entries(value.sessions)) {
    const normalized = normalizePersistedRendererValue(sessionValue)
    if (normalized) sessions[sessionKey] = normalized
  }
  return { sessions }
}

const readSessionFile = (): PersistedSessionFile => {
  return readJsonFile(appSessionPath(), normalizeSessionFile) ?? { sessions: {} }
}

const readSessionPersistValue = (sessionKey?: string | null): PersistedRendererValue | null => {
  return readSessionFile().sessions[normalizeSessionKey(sessionKey)] ?? null
}

const writeSessionPersistValue = (
  sessionKey: string | undefined | null,
  value: PersistedRendererValue,
): void => {
  const sessionFile = readSessionFile()
  sessionFile.sessions[normalizeSessionKey(sessionKey)] = value
  writeJsonFile(appSessionPath(), sessionFile)
}

const removeSessionPersistValue = (sessionKey?: string | null): void => {
  const sessionFile = readSessionFile()
  delete sessionFile.sessions[normalizeSessionKey(sessionKey)]
  writeJsonFile(appSessionPath(), sessionFile)
}

const readSettingsPersistValue = (key: RendererPersistKey): PersistedRendererValue | null => {
  const keys = rendererSettingsStateKeys[key]
  if (!keys) return null
  const value = normalizePersistedRendererValue(getStore().get('rendererPersist')?.[key])
  if (!value) return null
  return rendererPersistValue(pickState(value.state ?? {}, keys), value.version)
}

const mergeRendererPersistValues = (
  values: Array<PersistedRendererValue | null>,
): PersistedRendererValue | null => {
  const state: Record<string, unknown> = {}
  let version: number | undefined

  for (const value of values) {
    if (!value) continue
    if (typeof value.version === 'number') version = value.version
    Object.assign(state, value.state ?? {})
  }

  if (Object.keys(state).length === 0 && version === undefined) return null
  return rendererPersistValue(state, version)
}

const readCombinedRendererPersistValue = (
  key: RendererPersistKey,
  sessionKey?: string | null,
): PersistedRendererValue | null => {
  if (rendererSettingsStateKeys[key]) return readSettingsPersistValue(key)
  return mergeRendererPersistValues([
    readSessionPersistValue(sessionKey),
    readRendererPersistFile(recentProjectsPath()),
  ])
}

const writeRendererPersistValue = (
  key: RendererPersistKey,
  value: unknown,
  sessionKey?: string | null,
): void => {
  const normalized = normalizePersistedRendererValue(value)
  if (!normalized) {
    removeRendererPersistValue(key, sessionKey)
    return
  }

  const settingsKeys = rendererSettingsStateKeys[key]
  if (settingsKeys) {
    const store = getStore()
    const rendererPersist = store.get('rendererPersist') ?? {}
    store.set('rendererPersist', {
      ...rendererPersist,
      [key]: rendererPersistValue(
        pickState(normalized.state ?? {}, settingsKeys),
        normalized.version,
      ),
    })
    return
  }

  writeSessionPersistValue(
    sessionKey,
    rendererPersistValue(
      pickState(normalized.state ?? {}, workspaceSessionStateKeys),
      normalized.version,
    ),
  )
  writeJsonFile(
    recentProjectsPath(),
    rendererPersistValue(
      pickState(normalized.state ?? {}, workspaceRecentProjectsStateKeys),
      normalized.version,
    ),
  )
}

export const getWindowState = (): PersistedWindowState | null => {
  return readJsonFile(persistedWindowStatePath(), normalizeWindowState)
}

export const setWindowState = (state: PersistedWindowState): void => {
  writeJsonFile(persistedWindowStatePath(), state)
}

export const getRendererPersistValue = (key: string, sessionKey?: string | null): unknown => {
  assertRendererPersistKey(key)
  return readCombinedRendererPersistValue(key, sessionKey) ?? null
}

export const setRendererPersistValue = (
  key: string,
  value: unknown,
  sessionKey?: string | null,
): void => {
  assertRendererPersistKey(key)
  writeRendererPersistValue(key, value, sessionKey)
}

export const removeRendererPersistValue = (key: string, sessionKey?: string | null): void => {
  assertRendererPersistKey(key)
  if (rendererSettingsStateKeys[key]) {
    const rendererPersist = { ...(getStore().get('rendererPersist') ?? {}) }
    delete rendererPersist[key]
    getStore().set('rendererPersist', rendererPersist)
    return
  }

  removeSessionPersistValue(sessionKey)
  removeJsonFile(recentProjectsPath())
}

export const writeRendererPersistSession = (
  key: string,
  sessionKey: string | undefined | null,
  state: Record<string, unknown>,
  version?: number,
): PersistedRendererValue => {
  assertRendererPersistKey(key)
  assertWorkspacePersistKey(key)
  const value = rendererPersistValue(pickState(state, workspaceSessionStateKeys), version)
  writeSessionPersistValue(sessionKey, value)
  return value
}

export const copyRendererPersistSession = (
  key: string,
  sourceSessionKey: string | undefined | null,
  targetSessionKey: string | undefined | null,
  overrides: Record<string, unknown> = {},
): PersistedRendererValue | null => {
  assertRendererPersistKey(key)
  assertWorkspacePersistKey(key)
  const source = readSessionPersistValue(sourceSessionKey)
  if (!source) return writeRendererPersistSession(key, targetSessionKey, overrides)
  return writeRendererPersistSession(
    key,
    targetSessionKey,
    {
      ...(source.state ?? {}),
      ...overrides,
    },
    source.version,
  )
}

export const removeRendererSession = (sessionKey: string | undefined | null): void => {
  if (normalizeSessionKey(sessionKey) === DEFAULT_SESSION_KEY) return
  removeSessionPersistValue(sessionKey)
}
