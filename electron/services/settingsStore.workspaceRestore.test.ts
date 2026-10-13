import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LocalDatabaseService } from '@electron/database/service'
import { SettingsStore } from '@electron/services/settingsStore'
import { SettingsRepository } from '@electron/database/repositories/settingsRepository'
import { WORKSPACE_WINDOWS_SETTING_KEY } from '@electron/services/settingsStoreValues'

const workspaceKey = 'marklab.workspace'
const session = (rootPath: string, rootKind = 'external', file = 'Home.md') => ({
  state: {
    activeTabId: `file:edit:${file}`,
    rootKind,
    rootPath,
    tabs: [{ kind: 'file', path: file, view: 'edit' }],
  },
  version: 1,
})

describe('last opened workspace restoration', () => {
  let directory: string
  let database: LocalDatabaseService
  let store: SettingsStore

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-workspace-restore-'))
    database = new LocalDatabaseService({ userDataPath: directory })
    await database.initialize()
    store = new SettingsStore(database)
  })

  afterEach(async () => {
    await database.close()
    await fs.rm(directory, { force: true, recursive: true })
  })

  const restart = async () => {
    await database.close()
    database = new LocalDatabaseService({ userDataPath: directory })
    await database.initialize()
    store = new SettingsStore(database)
    store.restoreLastWorkspaceSession()
  }

  it('restores a new workspace and its latest tabs after that window has closed', async () => {
    store.setRendererPersistValue(workspaceKey, session('/default', 'internal'), 'main')
    store.writeRendererPersistSession(workspaceKey, 'new-window', session('/notes').state)
    const latest = session('/notes', 'external', 'Second.md')
    store.setRendererPersistValue(workspaceKey, latest, 'new-window')
    store.removeRendererSession('new-window')
    // The default window may still save during editing or application shutdown.
    store.setRendererPersistValue(workspaceKey, session('/default', 'internal'), 'main')

    await restart()

    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(latest)
  })

  it('keeps older window sessions isolated while restoring the last opened one', async () => {
    store.setRendererPersistValue(workspaceKey, session('/default', 'internal'), 'main')
    store.setRendererPersistValue(workspaceKey, session('/first'), 'first')
    store.setRendererPersistValue(workspaceKey, session('/second'), 'second')
    store.setRendererPersistValue(
      workspaceKey,
      session('/first', 'external', 'Changed.md'),
      'first',
    )

    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject({
      state: { rootPath: '/default', rootKind: 'internal' },
    })
    expect(store.getRendererPersistValue(workspaceKey, 'first')).toMatchObject({
      state: { rootPath: '/first', activeTabId: 'file:edit:Changed.md' },
    })
    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/second'))
  })

  it('remembers opening the same workspace again in another window', async () => {
    store.setRendererPersistValue(workspaceKey, session('/first'), 'first')
    store.setRendererPersistValue(workspaceKey, session('/second'), 'second')
    store.copyRendererPersistSession(workspaceKey, 'first', 'copy')
    store.setRendererPersistValue(workspaceKey, session('/second'), 'second')

    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/first'))
  })

  it.each([
    ['external', '/other'],
    ['single', '/note.md'],
    ['internal', '/default'],
  ])('remembers switching an existing window to a %s root', async (kind, rootPath) => {
    store.setRendererPersistValue(workspaceKey, session('/first'), 'main')
    store.setRendererPersistValue(workspaceKey, session('/second'), 'second')
    const selected = session(rootPath, kind)
    store.setRendererPersistValue(workspaceKey, selected, 'main')
    store.setRendererPersistValue(workspaceKey, session('/second'), 'second')

    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(selected)
  })

  it('does not replace the last workspace with an empty standby renderer session', async () => {
    store.setRendererPersistValue(workspaceKey, session('/notes'), 'notes')
    store.setRendererPersistValue(workspaceKey, { state: { rootPath: '', tabs: [] } }, 'standby')
    store.setRendererPersistValue(workspaceKey, null, 'invalid')

    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/notes'))
  })

  it('preserves the existing main session for installations without a last-workspace record', async () => {
    // Simulate a database written by an older release.
    store.setRendererPersistValue(workspaceKey, session('/legacy'), 'main')
    database.sqlite.prepare('DELETE FROM settings').run()

    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/legacy'))
  })

  it('leaves first launch without a saved workspace', async () => {
    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toBeNull()
  })

  it('restores every window open at quit with separate tabs, putting the last opened one first', async () => {
    const first = session('/first', 'external', 'First.md')
    const second = session('/second', 'external', 'Second.md')
    store.setRendererPersistValue(workspaceKey, first, 'main')
    store.setRendererPersistValue(workspaceKey, second, 'second')
    store.saveWorkspaceWindowSessions(['main', 'second'])
    store.removeRendererSession('second')
    await database.close()
    database = new LocalDatabaseService({ userDataPath: directory })
    await database.initialize()
    store = new SettingsStore(database)

    expect(store.restoreLastWorkspaceSession()).toEqual([first])
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(second)
  })

  it('excludes windows closed before quit and ignores empty standby sessions', async () => {
    store.setRendererPersistValue(workspaceKey, session('/first'), 'main')
    store.setRendererPersistValue(workspaceKey, session('/closed'), 'closed')
    store.removeRendererSession('closed')
    store.setRendererPersistValue(workspaceKey, { state: { rootPath: '' } }, 'standby')
    store.saveWorkspaceWindowSessions(['main', 'standby'])

    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/first'))
    expect(store.restoreLastWorkspaceSession()).toEqual([])
  })

  it('does not let automatic window restoration change the selected workspace', async () => {
    store.setRendererPersistValue(workspaceKey, session('/last'), 'main')
    store.writeRendererPersistSession(workspaceKey, 'restored', session('/older').state, 1, false)
    store.setRendererPersistValue(
      workspaceKey,
      session('/older', 'external', 'Updated.md'),
      'restored',
    )

    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/last'))
  })

  it('falls back to the last opened workspace when all windows were closed', async () => {
    store.setRendererPersistValue(workspaceKey, session('/last'), 'last')
    store.removeRendererSession('last')
    store.saveWorkspaceWindowSessions([])

    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/last'))
  })

  it('ignores malformed and empty saved window entries without losing the valid workspace', async () => {
    store.setRendererPersistValue(workspaceKey, session('/last'), 'main')
    new SettingsRepository(database).upsert(
      WORKSPACE_WINDOWS_SETTING_KEY,
      JSON.stringify({
        sessions: [
          null,
          { state: { rootPath: '' } },
          { state: { rootPath: 42 } },
          session('/valid'),
        ],
      }),
      1,
    )
    await restart()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/valid'))
  })

  it('keeps global preferences independent of workspace restore records', async () => {
    store.setRendererPersistValue(workspaceKey, session('/last'), 'main')
    store.setRendererPersistValue('marklab.preferences', { state: { locale: 'zh-CN' } })
    store.removeRendererPersistValue('marklab.preferences')
    store.removeRendererSession('main')
    await restart()
    expect(store.getRendererPersistValue('marklab.preferences')).toBeNull()
    expect(store.getRendererPersistValue(workspaceKey, 'main')).toMatchObject(session('/last'))
    expect(() => store.setWindowState({ width: NaN, height: 700, isMaximized: false })).toThrow(
      'Invalid window state',
    )
  })
})
