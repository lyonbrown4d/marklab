import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService'
import {
  cleanupFixtures,
  createFixture,
  manifest,
  remoteEntry,
  state,
} from '@electron/services/sync/webdavSync/engineTestSupport'
import type { WorkspaceSyncConflictResolution } from '@/types/workspaceSync'

const local = Buffer.from('my local version')
const remote = Buffer.from('saved remote version')
const binding = {
  provider: 'webdav',
  profileId: 'cloud',
  remoteRoot: '/documents',
  autoSync: false,
}

afterEach(cleanupFixtures)

const mutationFixture = async () => {
  const entry = remoteEntry('note.md', remote)
  const localEntry = remoteEntry('note.md', local)
  const conflict = {
    path: 'note.md',
    status: 'unresolved' as const,
    reason: 'both_changed' as const,
    conflictPath: 'note.conflict.md',
    localHash: localEntry.hash,
    remoteHash: entry.hash,
  }
  const fixture = await createFixture({
    initialState: {
      ...state([remoteEntry('note.md', Buffer.from('original'))]),
      unresolvedConflicts: [conflict],
    },
    remoteManifest: manifest([entry]),
    remoteFiles: { 'note.md': remote },
  })
  await fs.writeFile(path.join(fixture.root, 'note.md'), local)
  await fs.writeFile(path.join(fixture.root, 'note.conflict.md'), remote)
  const workspace = {
    rootInfo: () => ({ kind: 'external' as const, path: fixture.root }),
    getSessionGeneration: () => 1,
    flushBuffers: vi.fn(async () => undefined),
    invalidateExternalPaths: vi.fn(),
    runExternalPathMutation: async <T>(_paths: string[], work: () => Promise<T>): Promise<T> =>
      work(),
  }
  const service = new WorkspaceWebDavSyncService({
    configStore: { getChannels: async () => ({ webdav: binding }) },
    profileStore: { get: async () => ({ id: 'cloud' }), resolvePassword: async () => null },
    stateStore: fixture.stateStore,
    createRemoteClient: async () => ({}),
    createRemoteStore: () => fixture.remote,
  } as never)
  const request: WorkspaceSyncConflictResolution = {
    rootPath: fixture.root,
    path: 'note.md',
    binding,
    choice: 'remote',
    confirmDelete: false,
    expectedLocalHash: localEntry.hash,
    expectedRemoteHash: entry.hash,
  }
  return { ...fixture, service, workspace, request }
}

describe('conflict mutation buffer invalidation', () => {
  it('invalidates replaced local and published backup when state saving fails', async () => {
    const fixture = await mutationFixture()
    fixture.stateStore.save.mockRejectedValueOnce(new Error('database unavailable'))
    await expect(
      fixture.service.resolveConflict(fixture.workspace, fixture.request),
    ).rejects.toThrow('database unavailable')
    const backup = (await fs.readdir(fixture.root)).find((entry) =>
      entry.includes('.resolved-local-'),
    )!
    expect(fixture.workspace.invalidateExternalPaths).toHaveBeenCalledWith([backup, 'note.md'])
    expect(await fs.readFile(path.join(fixture.root, backup), 'utf8')).toBe(local.toString())
    expect(await fs.readFile(path.join(fixture.root, 'note.md'), 'utf8')).toBe(remote.toString())
    expect((await fixture.stateStore.load())?.unresolvedConflicts).toHaveLength(1)
  })

  it('invalidates an already-published backup when the replacement precondition fails', async () => {
    const fixture = await mutationFixture()
    let reads = 0
    fixture.remote.readManifest.mockImplementation(async () => ({
      manifest: manifest([remoteEntry('note.md', remote)]),
      etag: ++reads >= 4 ? 'manifest-changed' : 'manifest-1',
    }))
    await expect(
      fixture.service.resolveConflict(fixture.workspace, fixture.request),
    ).rejects.toThrow('Remote manifest changed')
    const backup = (await fs.readdir(fixture.root)).find((entry) =>
      entry.includes('.resolved-local-'),
    )!
    expect(fixture.workspace.invalidateExternalPaths).toHaveBeenCalledWith([backup])
    expect(await fs.readFile(path.join(fixture.root, 'note.md'), 'utf8')).toBe(local.toString())
    expect((await fixture.stateStore.load())?.unresolvedConflicts).toHaveLength(1)
  })
})
