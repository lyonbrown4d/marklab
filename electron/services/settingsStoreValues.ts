import { RENDERER_PERSIST_KEYS } from '@/types/persistenceKeys'
import type { PersistedRendererValue } from '@electron/services/settingsStoreSchemas'
import type { RendererPersistKey } from '@electron/types'

export const DEFAULT_SESSION_KEY = 'main'
export const MAIN_WINDOW_ID = 'main'
export const MAX_RECENT_WORKSPACES = 8

export const normalizeSessionKey = (value?: string | null): string =>
  value?.trim() ? value : DEFAULT_SESSION_KEY

export const pickState = (
  state: Record<string, unknown>,
  keys: Set<string>,
): Record<string, unknown> =>
  Object.fromEntries(Object.entries(state).filter(([key]) => keys.has(key)))

export const persistValue = (
  state: Record<string, unknown>,
  version?: number,
): PersistedRendererValue => ({ state, ...(version !== undefined ? { version } : {}) })

export const parseRecord = (value: string): Record<string, unknown> => {
  const parsed: unknown = JSON.parse(value)
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {}
}

export const parseTab = (value: string): unknown[] => {
  try {
    const parsed: unknown = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? [parsed] : []
  } catch {
    return []
  }
}

export const rootKind = (value: unknown): 'external' | 'internal' | 'single' =>
  value === 'external' || value === 'single' ? value : 'internal'

export const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null

export const tabRecord = (
  value: unknown,
  position: number,
): [string, number, string, string | null, string | null, string] | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const tab = value as Record<string, unknown>
  const kind = stringOrNull(tab.kind)
  if (!kind) return null
  const path = stringOrNull(tab.path)
  const id = tabId(tab, kind, path)
  return id ? [id, position, kind, path, stringOrNull(tab.title), JSON.stringify(tab)] : null
}

const tabId = (tab: Record<string, unknown>, kind: string, path: string | null): string | null => {
  if (kind === 'file' && path) return `file:${stringOrNull(tab.view) ?? 'edit'}:${path}`
  if (kind === 'git-diff' && path) {
    return `git-diff:${stringOrNull(tab.section) ?? 'unstaged'}:${path}`
  }
  if (kind === 'web' && stringOrNull(tab.id)) return `web:${stringOrNull(tab.id)}`
  return null
}

export const assertWorkspaceKey = (key: RendererPersistKey): void => {
  if (key !== RENDERER_PERSIST_KEYS.workspace) {
    throw new Error(`Unsupported workspace persist key: ${key}`)
  }
}
