import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupFixtures,
  createFixture,
  manifest,
  remoteEntry,
  state,
} from '@electron/services/sync/webdavSync/engineTestSupport.js'

afterEach(cleanupFixtures)

describe('WebDavSyncEngine convergence', () => {
  it('turns an applied local deletion into a no-op on the next sync', async () => {
    const body = Buffer.from('old')
    const prior = remoteEntry('old.txt', body)
    const fixture = await createFixture({
      initialState: state([prior]),
      remoteFiles: { 'old.txt': body },
      remoteManifest: manifest([prior]),
    })

    await expect(fixture.engine.sync(fixture.root)).resolves.toMatchObject({ deleted: 1 })
    await expect(fixture.engine.sync(fixture.root)).resolves.toMatchObject({ deleted: 0 })

    const secondManifest = fixture.remote.writeManifest.mock.calls[1]?.[0]
    expect(secondManifest?.entries).toEqual([
      expect.objectContaining({ path: 'old.txt', deletedAt: expect.any(String) }),
    ])
  })

  it('converges when both sides delete without recreating content', async () => {
    const body = Buffer.from('old')
    const prior = remoteEntry('old.txt', body)
    const tombstone = {
      ...prior,
      size: 0,
      deletedAt: '2026-02-01T00:00:00.000Z',
    }
    const fixture = await createFixture({
      initialState: state([prior]),
      remoteFiles: { 'old.txt': body },
      remoteManifest: manifest([tombstone]),
    })

    await expect(fixture.engine.sync(fixture.root)).resolves.toMatchObject({
      deleted: 0,
      downloaded: 0,
      uploaded: 0,
    })
    expect(fixture.remote.read).not.toHaveBeenCalled()
    expect(fixture.remote.write).not.toHaveBeenCalled()
    await expect(fs.stat(path.join(fixture.root, 'old.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  it('allows an explicit first bootstrap from complete legacy remote content', async () => {
    const body = Buffer.from('legacy')
    const fixture = await createFixture({
      remoteFiles: { 'legacy.md': body },
      remoteManifest: null,
    })

    await expect(fixture.engine.sync(fixture.root)).resolves.toMatchObject({ downloaded: 1 })
    await expect(fs.readFile(path.join(fixture.root, 'legacy.md'), 'utf8')).resolves.toBe('legacy')
    expect(fixture.remote.writeManifest).toHaveBeenCalledOnce()
  })

  it('does not mistake an empty initialized state for a first bootstrap', async () => {
    const fixture = await createFixture({ initialState: state([]), remoteManifest: null })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({
      code: 'precondition_failed',
    })
    expect(fixture.remote.list).not.toHaveBeenCalled()
    expect(fixture.remote.writeManifest).not.toHaveBeenCalled()
  })

  it('preserves oversized manifest entries across repeated syncs', async () => {
    const body = Buffer.from('oversized')
    const entry = remoteEntry('large.bin', body)
    const fixture = await createFixture({
      maxFileSize: 4,
      remoteFiles: { 'large.bin': body },
      remoteManifest: manifest([entry]),
    })

    await expect(fixture.engine.sync(fixture.root)).resolves.toMatchObject({
      skipped: [{ path: 'large.bin', reason: 'file_too_large', size: body.length }],
    })
    await expect(fixture.engine.sync(fixture.root)).resolves.toMatchObject({
      skipped: [{ path: 'large.bin', reason: 'file_too_large', size: body.length }],
    })
    expect(fixture.remote.writeManifest.mock.calls[1]?.[0].entries).toEqual([entry])
  })
})
