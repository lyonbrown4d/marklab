import { RecentWorkspaceRepository } from '@electron/database/repositories/recentWorkspaceRepository'
import { SessionTabRepository } from '@electron/database/repositories/sessionTabRepository'
import { SettingsRepository } from '@electron/database/repositories/settingsRepository'
import { WindowSessionRepository } from '@electron/database/repositories/windowSessionRepository'
import { WindowStateRepository } from '@electron/database/repositories/windowStateRepository'
import type { LocalDatabaseService } from '@electron/database/service'
import {
  rendererSettingsStateKeys,
  workspaceSessionStateKeys,
} from '@electron/services/settingsPersistKeys'
import {
  normalizePersistedRendererValue,
  normalizeWindowState,
  type PersistedRendererValue,
} from '@electron/services/settingsStoreSchemas'
import {
  assertWorkspaceKey,
  DEFAULT_SESSION_KEY,
  MAIN_WINDOW_ID,
  MAX_RECENT_WORKSPACES,
  normalizeSessionKey,
  parseRecord,
  parseTab,
  persistValue,
  pickState,
  rootKind,
  stringOrNull,
  tabRecord,
} from '@electron/services/settingsStoreValues'
import type { PersistedWindowState, RendererPersistKey } from '@electron/types'
import { canonicalWorkspacePath } from '@electron/services/workspace/workspaceIdentity'

export class SettingsStore {
  private readonly recents: RecentWorkspaceRepository
  private readonly sessions: WindowSessionRepository
  private readonly settings: SettingsRepository
  private readonly tabs: SessionTabRepository
  private readonly windows: WindowStateRepository

  constructor(private readonly localDatabase: LocalDatabaseService) {
    this.recents = new RecentWorkspaceRepository(localDatabase)
    this.sessions = new WindowSessionRepository(localDatabase)
    this.settings = new SettingsRepository(localDatabase)
    this.tabs = new SessionTabRepository(localDatabase)
    this.windows = new WindowStateRepository(localDatabase)
  }

  getWindowState(windowStateKey = MAIN_WINDOW_ID): PersistedWindowState | null {
    const row = this.windows.get(windowStateKey)
    if (!row) return null
    return normalizeWindowState({
      height: row.height,
      isMaximized: row.is_maximized === 1,
      width: row.width,
      ...(row.x !== null ? { x: row.x } : {}),
      ...(row.y !== null ? { y: row.y } : {}),
    })
  }

  setWindowState(value: PersistedWindowState, windowStateKey = MAIN_WINDOW_ID): void {
    const state = normalizeWindowState(value)
    if (!state) throw new Error('Invalid window state')
    this.windows.upsert(windowStateKey, state)
  }

  getRendererPersistValue(key: RendererPersistKey, sessionKey?: string | null): unknown {
    return rendererSettingsStateKeys[key] ? this.readSetting(key) : this.readWorkspace(sessionKey)
  }

  setRendererPersistValue(
    key: RendererPersistKey,
    value: unknown,
    sessionKey?: string | null,
  ): void {
    const normalized = normalizePersistedRendererValue(value)
    if (!normalized) {
      this.removeRendererPersistValue(key, sessionKey)
      return
    }
    if (rendererSettingsStateKeys[key]) this.writeSetting(key, normalized)
    else this.writeWorkspace(sessionKey, normalized, true)
  }

  removeRendererPersistValue(key: RendererPersistKey, sessionKey?: string | null): void {
    if (rendererSettingsStateKeys[key]) {
      this.settings.remove(key)
      return
    }
    this.removeRendererSession(sessionKey)
  }

  writeRendererPersistSession(
    key: RendererPersistKey,
    sessionKey: string | undefined | null,
    state: Record<string, unknown>,
    version?: number,
  ): PersistedRendererValue {
    assertWorkspaceKey(key)
    const value = persistValue(pickState(state, workspaceSessionStateKeys), version)
    this.writeWorkspace(sessionKey, value, false)
    return value
  }

  copyRendererPersistSession(
    key: RendererPersistKey,
    sourceSessionKey: string | undefined | null,
    targetSessionKey: string | undefined | null,
    overrides: Record<string, unknown> = {},
  ): PersistedRendererValue | null {
    assertWorkspaceKey(key)
    const source = this.readSession(sourceSessionKey)
    return this.writeRendererPersistSession(
      key,
      targetSessionKey,
      { ...(source?.state ?? {}), ...overrides },
      source?.version,
    )
  }

  removeRendererSession(sessionKey?: string | null): void {
    const id = normalizeSessionKey(sessionKey)
    if (id !== DEFAULT_SESSION_KEY) this.sessions.remove(id)
  }

  private readSetting(key: RendererPersistKey): PersistedRendererValue | null {
    const row = this.settings.get(key)
    return row ? persistValue(parseRecord(row.value_json), row.version ?? undefined) : null
  }

  private writeSetting(key: RendererPersistKey, value: PersistedRendererValue): void {
    const state = pickState(value.state ?? {}, rendererSettingsStateKeys[key] ?? new Set())
    this.settings.upsert(key, JSON.stringify(state), value.version ?? null)
  }

  private readWorkspace(sessionKey?: string | null): PersistedRendererValue | null {
    const session = this.readSession(sessionKey)
    const recentProjects = this.recents.list(MAX_RECENT_WORKSPACES)
    if (!session && recentProjects.length === 0) return null
    return persistValue(
      { ...(session?.state ?? {}), ...(recentProjects.length ? { recentProjects } : {}) },
      session?.version,
    )
  }

  private readSession(sessionKey?: string | null): PersistedRendererValue | null {
    const id = normalizeSessionKey(sessionKey)
    const row = this.sessions.get(id)
    if (!row) return null
    return persistValue(
      {
        activeTabId: row.active_tab_id,
        rootKind: row.root_kind,
        rootPath: row.root_path ?? '',
        tabs: this.tabs.listStateJson(id).flatMap(({ state_json }) => parseTab(state_json)),
      },
      row.version,
    )
  }

  private writeWorkspace(
    sessionKey: string | undefined | null,
    value: PersistedRendererValue,
    updateRecents: boolean,
  ): void {
    const id = normalizeSessionKey(sessionKey)
    const state = pickState(value.state ?? {}, workspaceSessionStateKeys)
    const tabs = Array.isArray(state.tabs) ? state.tabs : []
    this.localDatabase.sqlite.transaction(() => {
      this.sessions.upsert({
        active_tab_id: stringOrNull(state.activeTabId),
        id,
        root_kind: rootKind(state.rootKind),
        root_path: stringOrNull(state.rootPath),
        version: value.version ?? 1,
      })
      this.tabs.replace(id, toTabRows(id, tabs))
      if (updateRecents) this.updateRecentWorkspaces(value.state ?? {})
    })()
  }

  private updateRecentWorkspaces(state: Record<string, unknown>): void {
    const existing = this.recents.list(MAX_RECENT_WORKSPACES)
    const supplied = Array.isArray(state.recentProjects)
      ? state.recentProjects.filter(
          (value): value is string => typeof value === 'string' && !!value,
        )
      : []
    const rootPath = stringOrNull(state.rootPath)
    const paths = rootPath ? [rootPath, ...existing, ...supplied] : [...existing, ...supplied]
    this.recents.replace(dedupeWorkspacePaths(paths).slice(0, MAX_RECENT_WORKSPACES))
  }
}

const dedupeWorkspacePaths = (paths: string[]): string[] => {
  const seen = new Set<string>()
  return paths.filter((workspacePath) => {
    let key: string
    try {
      key = canonicalWorkspacePath(workspacePath)
    } catch {
      key = workspacePath.normalize('NFC')
    }
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

const toTabRows = (sessionId: string, tabs: unknown[]) =>
  tabs.flatMap((tab, position) => {
    const record = tabRecord(tab, position)
    if (!record) return []
    const [tabId, tabPosition, tabType, filePath, title, stateJson] = record
    return [
      {
        file_path: filePath,
        position: tabPosition,
        session_id: sessionId,
        state_json: stateJson,
        tab_id: tabId,
        tab_type: tabType,
        title,
      },
    ]
  })
