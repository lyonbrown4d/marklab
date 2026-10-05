import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { WorkspaceSyncConfigStore } from '@electron/services/sync/workspaceSyncConfig.js'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

const createRoot = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-config-'))
  roots.push(root)
  return root
}

describe('WorkspaceSyncConfigStore', () => {
  it('rejects unsupported legacy configuration without overwriting it', async () => {
    const userData = await createRoot()
    const workspace = path.join(userData, 'legacy-notes')
    const configDirectory = path.join(userData, 'sync')
    const configPath = path.join(configDirectory, 'workspace-bindings.json')
    await fs.mkdir(configDirectory)
    const legacy = JSON.stringify({ version: 1, workspaces: [] })
    await fs.writeFile(configPath, legacy)

    await expect(new WorkspaceSyncConfigStore(userData).getChannels(workspace)).rejects.toThrow(
      'Unsupported workspace sync configuration version',
    )
    await expect(fs.readFile(configPath, 'utf8')).resolves.toBe(legacy)
  })

  it('persists Git and WebDAV as independent channels for the same workspace', async () => {
    const userData = await createRoot()
    const workspace = path.join(userData, 'multi-channel-notes')
    const store = new WorkspaceSyncConfigStore(userData)

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

    await expect(new WorkspaceSyncConfigStore(userData).getChannels(workspace)).resolves.toEqual({
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
  })

  it('removes one channel without disabling the other channel', async () => {
    const userData = await createRoot()
    const workspace = path.join(userData, 'notes')
    const store = new WorkspaceSyncConfigStore(userData)
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
    const userData = await createRoot()
    const workspace = path.join(userData, 'notes')
    await fs.mkdir(workspace)
    const store = new WorkspaceSyncConfigStore(userData)

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
    const userData = await createRoot()
    const store = new WorkspaceSyncConfigStore(userData)

    await expect(
      store.setChannel('relative/workspace', {
        provider: 'git',
        remote: 'origin',
        branch: 'main',
        autoFetch: false,
      }),
    ).rejects.toThrow('absolute')
    await expect(
      store.setChannel(path.join(userData, 'notes'), {
        provider: 'webdav',
        profileId: 'personal-dav',
        remoteRoot: '/../escape',
        autoSync: false,
      }),
    ).rejects.toThrow('remote root')
    await expect(
      store.setChannel(path.join(userData, 'notes'), {
        provider: 'git',
        remote: '..',
        branch: 'bad..branch',
        autoFetch: false,
      }),
    ).rejects.toThrow('remote name')
  })

  it('fails closed when persisted configuration is corrupted', async () => {
    const userData = await createRoot()
    const configDirectory = path.join(userData, 'sync')
    await fs.mkdir(configDirectory)
    await fs.writeFile(path.join(configDirectory, 'workspace-bindings.json'), '{bad json')

    await expect(new WorkspaceSyncConfigStore(userData).listChannels()).rejects.toThrow(
      'could not be read',
    )
  })

  it('creates one stable device identity for all workspace bindings', async () => {
    const userData = await createRoot()
    const first = new WorkspaceSyncConfigStore(userData)
    const deviceId = await first.getOrCreateDeviceId()

    expect(deviceId).toMatch(/^[0-9a-f-]{36}$/)
    await expect(new WorkspaceSyncConfigStore(userData).getOrCreateDeviceId()).resolves.toBe(
      deviceId,
    )
  })
})
