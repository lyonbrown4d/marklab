import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalDatabaseService } from '@electron/database/localDatabaseService'
import { SettingsRepository } from '@electron/database/repositories/settingsRepository'
import { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig'

const roots: string[] = []
const databases: LocalDatabaseService[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()))
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

const createFixture = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-config-'))
  roots.push(root)
  const database = new LocalDatabaseService({ userDataPath: root })
  await database.initialize()
  databases.push(database)
  return { database, root, store: new WorkspaceSyncConfigStore(database) }
}

describe('WorkspaceSyncConfigStore', () => {
  it('persists one WebDAV channel for a workspace', async () => {
    const { database, root, store } = await createFixture()
    const workspace = path.join(root, 'webdav-notes')

    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/Marklab/notes',
      autoSync: false,
    })

    await expect(new WorkspaceSyncConfigStore(database).getChannels(workspace)).resolves.toEqual({
      webdav: {
        provider: 'webdav',
        profileId: 'personal-dav',
        remoteRoot: '/Marklab/notes',
        autoSync: false,
      },
    })
    await expect(fs.stat(path.join(root, 'sync', 'workspace-bindings.json'))).rejects.toMatchObject(
      {
        code: 'ENOENT',
      },
    )
  })

  it('removes the workspace WebDAV channel', async () => {
    const { root, store } = await createFixture()
    const workspace = path.join(root, 'notes')
    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/notes',
      autoSync: true,
    })

    await expect(store.removeChannel(workspace)).resolves.toEqual({ webdav: null })
  })

  it('updates the workspace WebDAV channel atomically', async () => {
    const { root, store } = await createFixture()
    const workspace = path.join(root, 'notes')

    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/Marklab/notes',
      autoSync: true,
    })
    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/updated',
      autoSync: false,
    })

    await expect(store.getChannels(workspace)).resolves.toEqual({
      webdav: {
        provider: 'webdav',
        profileId: 'personal-dav',
        remoteRoot: '/updated',
        autoSync: false,
      },
    })
  })

  it('refreshes the persisted update timestamp when replacing a binding', async () => {
    const { database, root, store } = await createFixture()
    const workspace = path.join(root, 'notes')
    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/before',
      autoSync: true,
    })
    const binding = await database.database
      .selectFrom('workspace_sync_channels')
      .select('workspace_id')
      .executeTakeFirstOrThrow()
    await database.database
      .updateTable('workspace_sync_channels')
      .set({ updated_at: '2000-01-01 00:00:00' })
      .where('workspace_id', '=', binding.workspace_id)
      .execute()

    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/after',
      autoSync: false,
    })

    const updated = await database.database
      .selectFrom('workspace_sync_channels')
      .select(['remote_root', 'updated_at'])
      .where('workspace_id', '=', binding.workspace_id)
      .executeTakeFirstOrThrow()
    expect(updated.remote_root).toBe('/after')
    expect(updated.updated_at).not.toBe('2000-01-01 00:00:00')
  })

  it('rejects Git-shaped sync configuration', async () => {
    const { root, store } = await createFixture()

    await expect(
      store.setChannel(path.join(root, 'notes'), {
        provider: 'git',
        remote: 'origin',
        branch: 'main',
        autoFetch: true,
      } as never),
    ).rejects.toThrow()
  })

  it('rejects unsafe workspace and remote paths', async () => {
    const { root, store } = await createFixture()

    await expect(
      store.setChannel('relative/workspace', {
        provider: 'webdav',
        profileId: 'personal-dav',
        remoteRoot: '/notes',
        autoSync: false,
      }),
    ).rejects.toThrow('absolute')
    await expect(
      store.setChannel(path.join(root, 'notes'), {
        provider: 'webdav',
        profileId: 'personal-dav',
        remoteRoot: '/../escape',
        autoSync: false,
      }),
    ).rejects.toThrow('remote root')
  })

  it('creates one stable device identity in the shared settings table', async () => {
    const { database, store } = await createFixture()
    const deviceId = await store.getOrCreateDeviceId()

    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/)
    await expect(new WorkspaceSyncConfigStore(database).getOrCreateDeviceId()).resolves.toBe(
      deviceId,
    )
    const setting = await database.database
      .selectFrom('settings')
      .select('value_json')
      .where('key', '=', 'sync.deviceId')
      .executeTakeFirstOrThrow()
    expect(JSON.parse(setting.value_json)).toBe(deviceId)
  })

  it('rejects a persisted device identity that is not a UUID', async () => {
    const { database, store } = await createFixture()
    new SettingsRepository(database).upsert('sync.deviceId', JSON.stringify('device-1'), null)

    await expect(store.getOrCreateDeviceId()).rejects.toThrow(
      'Workspace sync device identity could not be read',
    )
  })
})
