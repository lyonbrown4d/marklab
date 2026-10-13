import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LocalDatabaseService } from '@electron/database/service'
import { SettingsStore } from '@electron/services/settingsStore'
import { RecentWorkspaceHistory } from '@electron/services/recentWorkspaceHistory'

describe('recent workspace history', () => {
  let directory: string
  let database: LocalDatabaseService
  let store: SettingsStore
  const workspace = (rootPath: string, recentProjects: string[] = []) => ({
    state: { rootKind: 'external', rootPath, recentProjects, tabs: [] },
    version: 1,
  })

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-recent-workspaces-'))
    database = new LocalDatabaseService({ userDataPath: directory })
    await database.initialize()
    store = new SettingsStore(database)
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await database.close()
    await fs.rm(directory, { recursive: true, force: true })
  })

  it('checks existing directories, single files, missing paths and inaccessible paths without changing history', async () => {
    const file = path.join(directory, 'Note.md')
    const missing = path.join(directory, 'missing')
    const inaccessible = path.join(directory, 'private')
    await fs.writeFile(file, '# Note')
    await fs.mkdir(inaccessible)
    const access = fs.access.bind(fs)
    vi.spyOn(fs, 'access').mockImplementation(async (target, mode) => {
      if (target === inaccessible)
        throw Object.assign(new Error('permission denied'), { code: 'EACCES' })
      await access(target, mode)
    })
    store.setRendererPersistValue(
      'marklab.workspace',
      workspace(directory, [file, missing, inaccessible]),
    )

    await expect(store.listRecentWorkspaces()).resolves.toEqual([
      { path: directory, status: 'available' },
      { path: file, status: 'available' },
      { path: missing, status: 'missing' },
      { path: inaccessible, status: 'unavailable' },
    ])
    expect(store.getRendererPersistValue('marklab.workspace')).toMatchObject({
      state: { recentProjects: [directory, file, missing, inaccessible] },
    })
  })

  it('refreshes availability when a directory disappears and later comes back', async () => {
    const notes = path.join(directory, 'notes')
    await fs.mkdir(notes)
    store.setRendererPersistValue('marklab.workspace', workspace(notes))
    expect(await store.listRecentWorkspaces()).toEqual([{ path: notes, status: 'available' }])
    await fs.rm(notes, { recursive: true })
    expect(await store.listRecentWorkspaces()).toEqual([{ path: notes, status: 'missing' }])
    await fs.mkdir(notes)
    expect(await store.listRecentWorkspaces()).toEqual([{ path: notes, status: 'available' }])
  })

  it.each(['available', 'missing'])(
    'removes %s history without deleting files or changing the current session',
    async (status) => {
      const notes = path.join(directory, 'notes')
      if (status === 'available') {
        await fs.mkdir(notes)
        await fs.writeFile(path.join(notes, 'Note.md'), '# Keep me')
      }
      store.setRendererPersistValue('marklab.workspace', workspace(notes))
      store.removeRecentWorkspace(notes)
      store.removeRecentWorkspace(notes)
      expect(await store.listRecentWorkspaces()).toEqual([])
      expect(store.getRendererPersistValue('marklab.workspace')).toMatchObject({
        state: { rootPath: notes },
      })
      if (status === 'available')
        expect(await fs.readFile(path.join(notes, 'Note.md'), 'utf8')).toBe('# Keep me')
    },
  )

  it('keeps removed history out of stale window saves and after reopening the database', async () => {
    const removed = path.join(directory, 'removed')
    const stale = workspace(directory, [removed])
    store.setRendererPersistValue('marklab.workspace', stale, 'main')
    store.removeRecentWorkspace(removed)
    new SettingsStore(database).setRendererPersistValue('marklab.workspace', stale, 'other')
    store.setRendererPersistValue('marklab.workspace', stale, 'main')
    await database.close()
    database = new LocalDatabaseService({ userDataPath: directory })
    await database.initialize()
    store = new SettingsStore(database)
    expect(await store.listRecentWorkspaces()).toEqual([{ path: directory, status: 'available' }])
  })

  it('keeps removal of the active workspace across startup restoration and ordinary saves', async () => {
    store.setRendererPersistValue('marklab.workspace', workspace(directory))
    store.removeRecentWorkspace(directory)
    store.restoreLastWorkspaceSession()
    store.setRendererPersistValue('marklab.workspace', workspace(directory, [directory]))
    expect(await store.listRecentWorkspaces()).toEqual([])
  })

  it('allows explicitly reopening a removed workspace to add it to history again', async () => {
    store.setRendererPersistValue('marklab.workspace', workspace(directory))
    store.removeRecentWorkspace(directory)
    store.writeRendererPersistSession('marklab.workspace', 'new-window', workspace(directory).state)
    store.setRendererPersistValue('marklab.workspace', workspace(directory), 'new-window')
    expect(await store.listRecentWorkspaces()).toEqual([{ path: directory, status: 'available' }])
  })

  it('does not add unknown removals or automatically restored windows to the history', async () => {
    store.setRendererPersistValue('marklab.workspace', workspace(directory))
    store.removeRecentWorkspace(directory)
    store.removeRecentWorkspace(path.join(directory, 'unknown'))
    store.writeRendererPersistSession(
      'marklab.workspace',
      'restored',
      workspace(directory).state,
      1,
      false,
    )
    store.setRendererPersistValue('marklab.workspace', workspace(directory), 'restored')
    expect(await store.listRecentWorkspaces()).toEqual([])
  })

  it('deduplicates path aliases, bounds history and handles invalid supplied values', () => {
    const history = new RecentWorkspaceHistory(database)
    history.update({
      recentProjects: [
        directory,
        `${directory}/`,
        ...Array.from({ length: 12 }, (_, index) => path.join(directory, String(index))),
        42,
        '',
      ],
    })
    expect(history.listPaths()).toHaveLength(8)
    expect(history.listPaths()[0]).toBe(directory)
    history.update({ recentProjects: 'invalid' })
    expect(history.listPaths()).toHaveLength(8)
  })
})
