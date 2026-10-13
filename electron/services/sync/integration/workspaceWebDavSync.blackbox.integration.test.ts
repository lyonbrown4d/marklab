import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { LocalDatabaseService } from '@electron/database/localDatabaseService'
import { FileLocalSyncStateStore } from '@electron/services/sync/webdavSync/stateStore'
import { WorkspaceWebDavSyncService } from '@electron/services/sync/workspaceWebDavSyncService'
import { startWebDavServer } from '@electron/services/sync/integration/webDavServerFixture'
import type { WebDavProfile } from '@electron/services/sync/webdav/types'
import { parseSyncManifest } from '@electron/services/sync/webdavSync/manifest'

const temporaryRoots: string[] = []
const serverClosers: Array<() => Promise<void>> = []

afterEach(async () => {
  const cleanupTasks = [
    ...serverClosers.splice(0).map((close) => close()),
    ...temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  ]
  const results = await Promise.allSettled(cleanupTasks)
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason] : [],
  )
  if (failures.length > 0) throw new AggregateError(failures, 'WebDAV test cleanup failed')
})

describe('WebDAV synchronization protocol', { timeout: 30_000 }, () => {
  it('uploads, downloads, and preserves both versions of a conflict', async () => {
    const server = await startWebDavServer()
    serverClosers.push(server.close)
    const first = await createWorkspace('first', server.endpoint)
    const second = await createWorkspace('second', server.endpoint)
    await fs.writeFile(path.join(first.root, 'note.md'), 'initial from first\n')

    await expect(first.service.sync(first.workspace)).resolves.toMatchObject({ uploaded: 1 })
    const manifest = parseSyncManifest(
      JSON.parse(await server.readFile('documents/.marklab-sync/manifest.json')),
    )
    const uploadedEntry = manifest.entries.find(({ path: entryPath }) => entryPath === 'note.md')
    expect(uploadedEntry).toBeDefined()
    expect(await server.readFile(`documents/.marklab-sync/objects/${uploadedEntry!.hash}`)).toBe(
      'initial from first\n',
    )

    await expect(second.service.sync(second.workspace)).resolves.toMatchObject({ downloaded: 1 })
    expect(await fs.readFile(path.join(second.root, 'note.md'), 'utf8')).toBe(
      'initial from first\n',
    )

    await fs.writeFile(path.join(first.root, 'note.md'), 'changed by first\n')
    await fs.writeFile(path.join(second.root, 'note.md'), 'changed by second\n')
    await first.service.sync(first.workspace)
    const conflict = await second.service.sync(second.workspace)

    expect(conflict.conflicts).toEqual([
      expect.objectContaining({ path: 'note.md', reason: 'both_changed' }),
    ])
    expect(await fs.readFile(path.join(second.root, 'note.md'), 'utf8')).toBe('changed by second\n')
    const conflictPath = conflict.conflicts[0]?.conflictPath
    expect(conflictPath).toBeTruthy()
    expect(await fs.readFile(path.join(second.root, conflictPath!), 'utf8')).toBe(
      'changed by first\n',
    )
  })

  it('reports authentication failure through the stored-profile service boundary', async () => {
    const server = await startWebDavServer()
    serverClosers.push(server.close)
    const fixture = await createWorkspace('unauthorized', server.endpoint, 'wrong-password')

    await expect(fixture.service.testConnection('dav')).resolves.toMatchObject({
      ok: false,
      code: 'AUTHENTICATION_FAILED',
    })
  })

  it.each(['local', 'remote'] as const)(
    'settles the %s conflict choice over WebDAV without losing versions',
    async (choice) => {
      const server = await startWebDavServer()
      serverClosers.push(server.close)
      const first = await createWorkspace(`resolve-${choice}-first`, server.endpoint)
      const second = await createWorkspace(`resolve-${choice}-second`, server.endpoint)
      await fs.writeFile(path.join(first.root, 'note.md'), 'shared baseline\n')
      await first.service.sync(first.workspace)
      await second.service.sync(second.workspace)
      await fs.writeFile(path.join(first.root, 'note.md'), 'remote choice\n')
      await fs.writeFile(path.join(second.root, 'note.md'), 'local choice\n')
      await first.service.sync(first.workspace)
      await second.service.sync(second.workspace)
      const persisted = await second.service.listConflicts(second.workspace, second.root)
      expect(persisted.conflicts).toHaveLength(1)
      if (!persisted.binding) throw new Error('The sync binding is unavailable')
      const request = { rootPath: second.root, binding: persisted.binding, path: 'note.md' }
      const reviewed = await second.service.readConflict(second.workspace, request)
      expect(reviewed.local.text).toBe('local choice\n')
      expect(reviewed.savedRemote.text).toBe('remote choice\n')
      const resolved = await second.service.resolveConflict(second.workspace, {
        ...request,
        choice,
        confirmDelete: false,
        expectedLocalHash: reviewed.local.hash,
        expectedRemoteHash: reviewed.savedRemote.hash,
      })
      expect((await second.service.listConflicts(second.workspace, second.root)).conflicts).toEqual(
        [],
      )
      const next = await second.service.sync(second.workspace)
      expect(next.conflicts).toEqual([])
      await first.service.sync(first.workspace)
      expect(await fs.readFile(path.join(first.root, 'note.md'), 'utf8')).toBe(
        choice === 'local' ? 'local choice\n' : 'remote choice\n',
      )
      const savedPath = reviewed.conflict.conflictPath
      if (!savedPath) throw new Error('The saved remote copy is unavailable')
      expect(await fs.readFile(path.join(second.root, savedPath), 'utf8')).toBe('remote choice\n')
      if (choice === 'remote') {
        if (!resolved.backupPath) throw new Error('The local backup is unavailable')
        expect(await fs.readFile(path.join(second.root, resolved.backupPath), 'utf8')).toBe(
          'local choice\n',
        )
      }
    },
  )
})

const createWorkspace = async (name: string, endpoint: string, password = 'secret') => {
  const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), `marklab-webdav-${name}-`))
  temporaryRoots.push(fixtureRoot)
  const root = path.join(fixtureRoot, 'workspace')
  const userData = path.join(fixtureRoot, 'user-data')
  await fs.mkdir(root)
  const profile: WebDavProfile = {
    id: 'dav',
    label: 'Local fixture',
    endpoint,
    basePath: '/dav',
    username: 'marklab',
    allowInsecureLocal: true,
    sessionOnly: true,
    hasPassword: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const workspace = {
    flushBuffers: async () => undefined,
    invalidateExternalPaths: () => undefined,
    rootInfo: () => ({ kind: 'external' as const, path: root }),
    runExternalPathMutation: async <T>(_paths: string[], work: () => Promise<T>) => work(),
  }
  const localDatabase = new LocalDatabaseService({ userDataPath: userData })
  await localDatabase.initialize()
  serverClosers.push(() => localDatabase.close())
  const service = new WorkspaceWebDavSyncService({
    configStore: {
      getChannels: async () => ({
        webdav: {
          provider: 'webdav' as const,
          profileId: 'dav',
          remoteRoot: '/documents',
          autoSync: false,
        },
      }),
      getOrCreateDeviceId: async () => `device-${name}`,
    } as never,
    profileStore: {
      get: async () => profile,
      resolvePassword: async () => password,
    } as never,
    stateStore: new FileLocalSyncStateStore(localDatabase),
  })
  return { root, service, workspace }
}
