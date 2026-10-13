import fs from 'node:fs/promises'
import { constants } from 'node:fs'
import { RecentWorkspaceRepository } from '@electron/database/repositories/recentWorkspaceRepository'
import { SettingsRepository } from '@electron/database/repositories/settingsRepository'
import type { LocalDatabaseService } from '@electron/database/service'
import {
  MAX_RECENT_WORKSPACES,
  parseRecord,
  stringOrNull,
} from '@electron/services/settingsStoreValues'
import { canonicalWorkspacePath } from '@electron/services/workspace/workspaceIdentity'
import type { RecentWorkspace } from '@/types/recentWorkspaces'
import { RecentWorkspaceWatcher } from '@electron/services/recentWorkspaceWatcher'

const REMOVED_HISTORY_KEY = 'marklab.removed-workspace-history'

const pathKey = (workspacePath: string): string => {
  try {
    return canonicalWorkspacePath(workspacePath)
  } catch {
    return workspacePath.normalize('NFC')
  }
}

export class RecentWorkspaceHistory {
  private readonly watcher = new RecentWorkspaceWatcher()
  private readonly repository: RecentWorkspaceRepository
  private readonly settings: SettingsRepository

  constructor(private readonly localDatabase: LocalDatabaseService) {
    this.repository = new RecentWorkspaceRepository(localDatabase)
    this.settings = new SettingsRepository(localDatabase)
  }

  listPaths(): string[] {
    return this.repository.list(MAX_RECENT_WORKSPACES)
  }

  onChanged(listener: () => void): () => void {
    return this.watcher.subscribe(this.listPaths(), listener)
  }

  async list(): Promise<RecentWorkspace[]> {
    return Promise.all(
      this.listPaths().map(async (workspacePath): Promise<RecentWorkspace> => {
        try {
          const stat = await fs.stat(workspacePath)
          await fs.access(workspacePath, constants.R_OK | (stat.isDirectory() ? constants.X_OK : 0))
          return {
            path: workspacePath,
            status: stat.isDirectory() || stat.isFile() ? 'available' : 'unavailable',
          }
        } catch (error) {
          const code =
            error && typeof error === 'object' && 'code' in error ? error.code : undefined
          return {
            path: workspacePath,
            status: code === 'ENOENT' || code === 'ENOTDIR' ? 'missing' : 'unavailable',
          }
        }
      }),
    )
  }

  remove(workspacePath: string): void {
    const key = pathKey(workspacePath)
    const paths = this.listPaths()
    if (!paths.some((entry) => pathKey(entry) === key)) return
    this.localDatabase.sqlite.transaction(() => {
      const removed = this.removedPaths()
      removed.add(key)
      this.writeRemovedPaths(removed)
      this.repository.replace(paths.filter((entry) => pathKey(entry) !== key))
    })()
    this.watcher.setPaths(this.listPaths())
  }

  allowOpenedPath(workspacePath: string): void {
    const removed = this.removedPaths()
    if (removed.delete(pathKey(workspacePath))) this.writeRemovedPaths(removed)
  }

  update(state: Record<string, unknown>): void {
    const supplied = Array.isArray(state.recentProjects)
      ? state.recentProjects.filter(
          (value): value is string => typeof value === 'string' && !!value,
        )
      : []
    const rootPath = stringOrNull(state.rootPath)
    const paths = [...(rootPath ? [rootPath] : []), ...this.listPaths(), ...supplied]
    const seen = this.removedPaths()
    this.repository.replace(
      paths
        .filter((entry) => {
          const key = pathKey(entry)
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        .slice(0, MAX_RECENT_WORKSPACES),
    )
    this.watcher.setPaths(this.listPaths())
  }

  private removedPaths(): Set<string> {
    const row = this.settings.get(REMOVED_HISTORY_KEY)
    const paths = row ? parseRecord(row.value_json).paths : []
    return new Set(
      Array.isArray(paths)
        ? paths.filter((entry): entry is string => typeof entry === 'string')
        : [],
    )
  }

  private writeRemovedPaths(paths: Set<string>): void {
    this.settings.upsert(REMOVED_HISTORY_KEY, JSON.stringify({ paths: [...paths] }), 1)
  }
}
