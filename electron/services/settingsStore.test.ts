import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { LocalDatabaseService } from '@electron/database/service'
import { SettingsStore } from '@electron/services/settingsStore'

describe('SettingsStore SQLite persistence', () => {
  let database: LocalDatabaseService
  let directory: string
  let store: SettingsStore

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-settings-'))
    database = new LocalDatabaseService({ userDataPath: directory })
    await database.initialize()
    store = new SettingsStore(database)
  })

  afterEach(async () => {
    await database.close()
    await fs.rm(directory, { force: true, recursive: true })
  })

  it('persists renderer settings independently by key', () => {
    store.setRendererPersistValue('marklab.preferences', {
      state: { locale: 'zh-CN', sidebarCollapsed: true, ignored: 'value' },
      version: 3,
    })

    expect(store.getRendererPersistValue('marklab.preferences')).toEqual({
      state: { locale: 'zh-CN', sidebarCollapsed: true },
      version: 3,
    })
    expect(store.getRendererPersistValue('marklab.drawio')).toBeNull()
  })

  it('isolates sessions while keeping recent workspaces shared across windows', () => {
    store.setRendererPersistValue(
      'marklab.workspace',
      {
        state: {
          activeTabId: 'first',
          recentProjects: ['D:/Projects/one', 'D:/Projects/two'],
          rootPath: 'D:/Projects/one',
          tabs: [],
        },
        version: 1,
      },
      'window-one',
    )
    store.setRendererPersistValue(
      'marklab.workspace',
      {
        state: { recentProjects: [], rootPath: 'D:/Projects/two', tabs: [] },
        version: 1,
      },
      'window-two',
    )

    expect(store.getRendererPersistValue('marklab.workspace', 'window-one')).toMatchObject({
      state: {
        activeTabId: 'first',
        recentProjects: ['D:/Projects/two', 'D:/Projects/one'],
        rootPath: 'D:/Projects/one',
      },
    })
    expect(store.getRendererPersistValue('marklab.workspace', 'window-two')).toMatchObject({
      state: {
        recentProjects: ['D:/Projects/two', 'D:/Projects/one'],
        rootPath: 'D:/Projects/two',
      },
    })
  })

  it('deduplicates canonical aliases in recent workspaces', () => {
    store.setRendererPersistValue(
      'marklab.workspace',
      {
        state: {
          recentProjects: ['C:\\Notes\\Cafe\u0301\\', 'c:/notes/Café'],
          rootPath: 'C:/NOTES/Café',
          tabs: [],
        },
      },
      'window-one',
    )

    expect(store.getRendererPersistValue('marklab.workspace', 'window-one')).toMatchObject({
      state: { recentProjects: ['C:/NOTES/Café'] },
    })
  })

  it('copies and removes one window session without removing shared recent workspaces', () => {
    store.setRendererPersistValue(
      'marklab.workspace',
      {
        state: { activeTabId: 'readme', recentProjects: ['C:/repo'], rootPath: 'C:/repo' },
        version: 2,
      },
      'source',
    )

    store.copyRendererPersistSession('marklab.workspace', 'source', 'target', {
      rootPath: 'C:/repo-two',
    })
    store.removeRendererSession('source')

    expect(store.getRendererPersistValue('marklab.workspace', 'source')).toEqual({
      state: { recentProjects: ['C:/repo'] },
    })
    expect(store.getRendererPersistValue('marklab.workspace', 'target')).toMatchObject({
      state: { activeTabId: 'readme', recentProjects: ['C:/repo'], rootPath: 'C:/repo-two' },
      version: 2,
    })
  })

  it('removes workspace persistence without clearing global recent workspaces', () => {
    store.setRendererPersistValue(
      'marklab.workspace',
      { state: { recentProjects: ['C:/repo'], rootPath: 'C:/repo', tabs: [] } },
      'window-one',
    )

    store.removeRendererPersistValue('marklab.workspace', 'window-one')

    expect(store.getRendererPersistValue('marklab.workspace', 'window-one')).toEqual({
      state: { recentProjects: ['C:/repo'] },
    })
  })

  it('round trips normalized window state', () => {
    store.setWindowState({ height: 720, isMaximized: true, width: 1280, x: 24, y: 48 })

    expect(store.getWindowState()).toEqual({
      height: 720,
      isMaximized: true,
      width: 1280,
      x: 24,
      y: 48,
    })
  })
})
