import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  compareSyncConflict,
  resolveSyncConflict,
} from '@electron/services/sync/webdavSync/conflictResolution'
import {
  cleanupFixtures,
  createFixture,
  manifest,
  remoteEntry,
  state,
} from '@electron/services/sync/webdavSync/engineTestSupport'
import type { WorkspaceSyncConflictResolution } from '@/types/workspaceSync'

const original = Buffer.from('original')
const local = Buffer.from('my version')
const remote = Buffer.from('their version')

afterEach(cleanupFixtures)

const conflictFixture = async (
  localBody: Buffer | null = local,
  remoteBody: Buffer | null = remote,
) => {
  const baseline = remoteEntry('note.md', original)
  const remoteVersion = remoteBody
    ? remoteEntry('note.md', remoteBody)
    : { ...baseline, deletedAt: '2026-03-01T00:00:00.000Z' }
  const fixture = await createFixture({
    initialState: {
      ...state([baseline]),
      unresolvedConflicts: [
        {
          path: 'note.md',
          status: 'unresolved',
          reason: localBody && remoteBody ? 'both_changed' : 'delete_vs_change',
          ...(localBody ? { localHash: remoteEntry('note.md', localBody).hash } : {}),
          remoteHash: remoteVersion.hash,
          ...(remoteBody ? { conflictPath: 'note.conflict.md' } : {}),
        },
      ],
    },
    remoteManifest: manifest([remoteVersion]),
    remoteFiles: remoteBody ? { 'note.md': remoteBody } : {},
  })
  if (localBody) await fs.writeFile(path.join(fixture.root, 'note.md'), localBody)
  if (remoteBody) await fs.writeFile(path.join(fixture.root, 'note.conflict.md'), remoteBody)
  const comparison = await compareSyncConflict(fixture.root, 'note.md', fixture.stateStore)
  const request: WorkspaceSyncConflictResolution = {
    rootPath: fixture.root,
    path: 'note.md',
    binding: { profileId: 'profile', remoteRoot: '/' },
    choice: 'local',
    confirmDelete: false,
    expectedLocalHash: comparison.local.hash,
    expectedRemoteHash: comparison.savedRemote.hash,
  }
  const resolve = (
    overrides: Partial<WorkspaceSyncConflictResolution> = {},
    assertContext = async () => undefined,
  ) =>
    resolveSyncConflict({
      root: fixture.root,
      request: { ...request, ...overrides },
      stateStore: fixture.stateStore,
      remote: fixture.remote,
      signal: new AbortController().signal,
      assertContext,
    })
  return { ...fixture, comparison, resolve }
}

describe('durable sync conflict decisions', () => {
  it('keeps both versions on comparison and publishes a reviewed manual merge on next sync', async () => {
    const fixture = await conflictFixture()
    expect(fixture.comparison.local.text).toBe('my version')
    expect(fixture.comparison.savedRemote.text).toBe('their version')
    await fs.writeFile(path.join(fixture.root, 'note.md'), 'manually merged')
    const reviewed = await compareSyncConflict(fixture.root, 'note.md', fixture.stateStore)
    await fixture.resolve({ expectedLocalHash: reviewed.local.hash })
    expect((await fixture.stateStore.load())?.unresolvedConflicts).toEqual([])
    const result = await fixture.engine.sync(fixture.root)
    expect(result.conflicts).toEqual([])
    expect(result.uploaded).toBeGreaterThan(0)
    expect(await fs.readFile(path.join(fixture.root, 'note.conflict.md'), 'utf8')).toBe(
      'their version',
    )
    const nextManifest = await fixture.remote.readManifest()
    expect(nextManifest?.manifest.entries.find((entry) => entry.path === 'note.md')?.hash).toBe(
      reviewed.local.hash,
    )
  })

  it('chooses saved remote with a recoverable local backup and survives state reload', async () => {
    const fixture = await conflictFixture()
    const result = await fixture.resolve({ choice: 'remote' })
    expect(result.backupPath).toBeTruthy()
    expect(await fs.readFile(path.join(fixture.root, result.backupPath!), 'utf8')).toBe(
      'my version',
    )
    expect(await fs.readFile(path.join(fixture.root, 'note.md'), 'utf8')).toBe('their version')
    expect((await fixture.stateStore.load())?.baseline[0]?.hash).toBe(
      fixture.comparison.savedRemote.hash,
    )
    expect((await fixture.engine.sync(fixture.root)).conflicts).toEqual([])
  })

  it('requires confirmation before choosing local deletion against remote change', async () => {
    const fixture = await conflictFixture(null)
    await expect(fixture.resolve()).rejects.toThrow('Confirm the deletion')
    expect((await fixture.stateStore.load())?.unresolvedConflicts).toHaveLength(1)
    await fixture.resolve({ confirmDelete: true })
    const result = await fixture.engine.sync(fixture.root)
    expect(result.conflicts).toEqual([])
    expect(result.deleted).toBeGreaterThan(0)
  })

  it('preserves changed local before deliberately choosing remote deletion', async () => {
    const fixture = await conflictFixture(local, null)
    await expect(fixture.resolve({ choice: 'remote' })).rejects.toThrow('Confirm the deletion')
    const result = await fixture.resolve({ choice: 'remote', confirmDelete: true })
    expect(await fs.readFile(path.join(fixture.root, result.backupPath!), 'utf8')).toBe(
      'my version',
    )
    await expect(fs.stat(path.join(fixture.root, 'note.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect((await fixture.engine.sync(fixture.root)).conflicts).toEqual([])
  })

  it('refuses stale local, altered saved remote, and changed remote manifest', async () => {
    const fixture = await conflictFixture()
    await fs.writeFile(path.join(fixture.root, 'note.md'), 'newer local edit')
    await expect(fixture.resolve()).rejects.toThrow('changed')
    await fs.writeFile(path.join(fixture.root, 'note.md'), local)
    await fs.writeFile(path.join(fixture.root, 'note.conflict.md'), 'altered remote copy')
    await expect(fixture.resolve()).rejects.toThrow('Saved remote')
    await fs.writeFile(path.join(fixture.root, 'note.conflict.md'), remote)
    await fixture.remote.writeManifest(
      manifest([remoteEntry('note.md', Buffer.from('new remote'))]),
    )
    await expect(fixture.resolve()).rejects.toThrow('Remote version changed')
    expect((await fixture.stateStore.load())?.unresolvedConflicts).toHaveLength(1)
    expect(await fs.readFile(path.join(fixture.root, 'note.md'), 'utf8')).toBe('my version')
  })

  it('rejects symlinked saved copies and root/session changes before replacement', async () => {
    const fixture = await conflictFixture()
    await expect(
      fixture.resolve({ choice: 'remote' }, async () => {
        throw new Error('session changed')
      }),
    ).rejects.toThrow('session changed')
    await fs.rm(path.join(fixture.root, 'note.conflict.md'))
    await fs.symlink(
      path.join(fixture.root, 'note.md'),
      path.join(fixture.root, 'note.conflict.md'),
    )
    await expect(fixture.resolve()).rejects.toThrow('symbolic link')
    expect((await fixture.stateStore.load())?.unresolvedConflicts).toHaveLength(1)
  })

  it('retains backup and unresolved metadata if durable saving fails after replacement', async () => {
    const fixture = await conflictFixture()
    fixture.stateStore.save.mockRejectedValueOnce(new Error('disk failed'))
    await expect(fixture.resolve({ choice: 'remote' })).rejects.toThrow('disk failed')
    const files = await fs.readdir(fixture.root)
    const backup = files.find((entry) => entry.includes('.resolved-local-'))
    expect(await fs.readFile(path.join(fixture.root, backup!), 'utf8')).toBe('my version')
    expect((await fixture.stateStore.load())?.unresolvedConflicts).toHaveLength(1)
  })

  it('bounds previews for large and binary files without losing content hashes', async () => {
    const fixture = await conflictFixture(Buffer.alloc(65 * 1024, 'a'), Buffer.from([0, 1, 2]))
    expect(fixture.comparison.local).toMatchObject({
      text: null,
      unavailable: 'too_large',
      size: 65 * 1024,
    })
    expect(fixture.comparison.local.hash).toHaveLength(64)
    expect(fixture.comparison.savedRemote).toMatchObject({ text: null, unavailable: 'binary' })
  })
})
