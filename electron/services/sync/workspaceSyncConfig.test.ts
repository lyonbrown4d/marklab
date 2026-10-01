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
  it('persists one typed sync binding per canonical workspace', async () => {
    const userData = await createRoot()
    const workspace = path.join(userData, 'notes')
    await fs.mkdir(workspace)
    const store = new WorkspaceSyncConfigStore(userData)

    await store.set(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/Marklab/notes',
      autoSync: true,
    })

    const reopened = new WorkspaceSyncConfigStore(userData)
    await expect(reopened.get(workspace)).resolves.toEqual({
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/Marklab/notes',
      autoSync: true,
    })
  })

  it('replaces a provider binding atomically and can disable sync', async () => {
    const userData = await createRoot()
    const workspace = path.join(userData, 'notes')
    await fs.mkdir(workspace)
    const store = new WorkspaceSyncConfigStore(userData)

    await store.set(workspace, {
      provider: 'webdav',
      profileId: 'personal-dav',
      remoteRoot: '/notes',
      autoSync: false,
    })
    await store.set(workspace, {
      provider: 'git',
      remote: 'origin',
      branch: 'main',
      autoFetch: true,
    })

    await expect(store.get(workspace)).resolves.toEqual({
      provider: 'git',
      remote: 'origin',
      branch: 'main',
      autoFetch: true,
    })
    await expect(store.remove(workspace)).resolves.toEqual({ ok: true })
    await expect(store.get(workspace)).resolves.toBeNull()
  })

  it('rejects unsafe workspace and remote paths', async () => {
    const userData = await createRoot()
    const store = new WorkspaceSyncConfigStore(userData)

    await expect(
      store.set('relative/workspace', {
        provider: 'git',
        remote: 'origin',
        branch: 'main',
        autoFetch: false,
      }),
    ).rejects.toThrow('absolute')
    await expect(
      store.set(path.join(userData, 'notes'), {
        provider: 'webdav',
        profileId: 'personal-dav',
        remoteRoot: '/../escape',
        autoSync: false,
      }),
    ).rejects.toThrow('remote root')
  })

  it('fails closed when persisted configuration is corrupted', async () => {
    const userData = await createRoot()
    const configDirectory = path.join(userData, 'sync')
    await fs.mkdir(configDirectory)
    await fs.writeFile(path.join(configDirectory, 'workspace-bindings.json'), '{bad json')

    await expect(new WorkspaceSyncConfigStore(userData).list()).rejects.toThrow('could not be read')
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
