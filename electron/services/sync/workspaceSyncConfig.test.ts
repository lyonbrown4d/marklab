import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalDatabaseService } from '@electron/database/localDatabaseService'
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
  it('persists Git and WebDAV as independent channels for the same workspace', async () => {
    const { database, root, store } = await createFixture()
    const workspace = path.join(root, 'multi-channel-notes')

    await store.setChannel(workspace, {
      provider: 'git',
      remote: 'origin',
      branch: 'main',
      autoFetch: true,
    })
    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/Marklab/notes',
      autoSync: false,
    })

    await expect(new WorkspaceSyncConfigStore(database).getChannels(workspace)).resolves.toEqual({
      git: {
        provider: 'git',
        remote: 'origin',
        branch: 'main',
        autoFetch: true,
      },
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

  it('removes one channel without disabling the other channel', async () => {
    const { root, store } = await createFixture()
    const workspace = path.join(root, 'notes')
    await store.setChannel(workspace, {
      provider: 'git',
      remote: 'origin',
      autoFetch: false,
    })
    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/notes',
      autoSync: true,
    })

    await expect(store.removeChannel(workspace, 'webdav')).resolves.toEqual({
      git: { provider: 'git', remote: 'origin', autoFetch: false },
      webdav: null,
    })
  })

  it('updates one channel atomically without replacing another channel', async () => {
    const { root, store } = await createFixture()
    const workspace = path.join(root, 'notes')

    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/Marklab/notes',
      autoSync: true,
    })
    await store.setChannel(workspace, {
      provider: 'git',
      remote: 'origin',
      branch: 'main',
      autoFetch: true,
    })
    await store.setChannel(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/updated',
      autoSync: false,
    })

    await expect(store.getChannels(workspace)).resolves.toEqual({
      git: { provider: 'git', remote: 'origin', branch: 'main', autoFetch: true },
      webdav: {
        provider: 'webdav',
        profileId: 'personal-dav',
        remoteRoot: '/updated',
        autoSync: false,
      },
    })
  })

  it('rejects unsafe workspace and remote paths', async () => {
    const { root, store } = await createFixture()

    await expect(
      store.setChannel('relative/workspace', {
        provider: 'git',
        remote: 'origin',
        branch: 'main',
        autoFetch: false,
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
    await expect(
      store.setChannel(path.join(root, 'notes'), {
        provider: 'git',
        remote: '..',
        branch: 'bad..branch',
        autoFetch: false,
      }),
    ).rejects.toThrow('remote name')
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
})
