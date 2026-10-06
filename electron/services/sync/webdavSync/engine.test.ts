import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupFixtures,
  createFixture,
  manifest,
  remoteEntry,
  state,
} from '@electron/services/sync/webdavSync/engineTestSupport'

afterEach(cleanupFixtures)

describe('WebDavSyncEngine', () => {
  it('stops before remote work when flushing editor buffers fails', async () => {
    const fixture = await createFixture()
    fixture.flushWorkspace.mockRejectedValue(new Error('flush failed'))

    await expect(fixture.engine.sync(fixture.root)).rejects.toThrow('flush failed')
    expect(fixture.remote.readManifest).not.toHaveBeenCalled()
  })

  it('downloads through the mutation boundary and invalidates once per batch', async () => {
    const body = Buffer.from('remote note')
    const fixture = await createFixture({
      remoteFiles: { 'notes/a.md': body },
      remoteManifest: manifest([remoteEntry('notes/a.md', body)]),
    })

    const result = await fixture.engine.sync(fixture.root)

    expect(result.downloaded).toBe(1)
    expect(fixture.mutationBoundary).toHaveBeenCalledOnce()
    expect(fixture.invalidateWorkspace).toHaveBeenCalledOnce()
    expect(fixture.invalidateWorkspace).toHaveBeenCalledWith(fixture.root, ['notes/a.md'])
    await expect(fs.readFile(path.join(fixture.root, 'notes', 'a.md'), 'utf8')).resolves.toBe(
      'remote note',
    )
  })

  it('preserves the local file and writes a stable remote conflict copy', async () => {
    const baselineBody = Buffer.from('baseline')
    const localBody = Buffer.from('local change')
    const remoteBody = Buffer.from('remote change')
    const baseline = remoteEntry('note.txt', baselineBody)
    const fixture = await createFixture({
      initialState: state([baseline]),
      remoteFiles: { 'note.txt': remoteBody },
      remoteManifest: manifest([
        { ...remoteEntry('note.txt', remoteBody), deviceId: 'remote-device' },
      ]),
    })
    await fs.writeFile(path.join(fixture.root, 'note.txt'), localBody)

    const result = await fixture.engine.sync(fixture.root)

    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]?.conflictPath).toMatch(/\.conflict-remote-device-/)
    await expect(fs.readFile(path.join(fixture.root, 'note.txt'), 'utf8')).resolves.toBe(
      'local change',
    )
    await expect(
      fs.readFile(path.join(fixture.root, result.conflicts[0]!.conflictPath!), 'utf8'),
    ).resolves.toBe('remote change')
    expect(result.conflicts[0]?.status).toBe('unresolved')
    expect(fixture.stateStore.save).toHaveBeenLastCalledWith(
      fixture.root,
      expect.objectContaining({ unresolvedConflicts: result.conflicts }),
    )

    const repeated = await fixture.engine.sync(fixture.root)
    expect(repeated.conflicts[0]?.conflictPath).toBe(result.conflicts[0]?.conflictPath)
    const conflictFiles = (await fs.readdir(fixture.root)).filter((name) =>
      name.includes('.conflict-'),
    )
    expect(conflictFiles).toHaveLength(1)
  })

  it('re-reads and re-plans after a manifest precondition race', async () => {
    const fixture = await createFixture({ failManifestWrites: 1 })
    await fs.writeFile(path.join(fixture.root, 'local.txt'), 'local')

    const result = await fixture.engine.sync(fixture.root)

    expect(result.retries).toBe(1)
    expect(result.uploaded).toBe(1)
    expect(fixture.remote.readManifest).toHaveBeenCalledTimes(2)
    expect(fixture.remote.writeManifest).toHaveBeenCalledTimes(2)
    expect(fixture.remote.write).toHaveBeenCalledOnce()
  })

  it('stops after two manifest re-plans', async () => {
    const fixture = await createFixture({ failManifestWrites: 3 })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({
      code: 'precondition_failed',
    })
    expect(fixture.remote.writeManifest).toHaveBeenCalledTimes(3)
  })

  it('writes a tombstone when a previously synchronized local file was deleted', async () => {
    const body = Buffer.from('old')
    const prior = remoteEntry('old.txt', body)
    const fixture = await createFixture({
      initialState: state([prior]),
      remoteFiles: { 'old.txt': body },
      remoteManifest: manifest([prior]),
    })

    const result = await fixture.engine.sync(fixture.root)

    expect(result.deleted).toBe(1)
    const written = fixture.remote.writeManifest.mock.calls[0]?.[0]
    expect(written?.entries[0]).toMatchObject({
      path: 'old.txt',
      deletedAt: '2026-02-03T04:05:06.000Z',
      deviceId: 'local-device',
    })
  })

  it('aborts without invalidating when cancelled before scanning', async () => {
    const fixture = await createFixture()
    const controller = new AbortController()
    controller.abort()

    await expect(
      fixture.engine.sync(fixture.root, { signal: controller.signal }),
    ).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fixture.invalidateWorkspace).not.toHaveBeenCalled()
  })

  it('supports explicit cancellation by canonical workspace root', async () => {
    const fixture = await createFixture()
    fixture.flushWorkspace.mockImplementation(() => new Promise(() => undefined))
    const pending = fixture.engine.sync(fixture.root)

    expect(fixture.engine.cancel(path.join(fixture.root, '.'))).toBe(true)
    await expect(pending).rejects.toMatchObject({ name: 'AbortError', code: 'aborted' })
  })
})
