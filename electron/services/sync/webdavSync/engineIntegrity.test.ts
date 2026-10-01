import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WebDavError } from '@electron/services/sync/webdav/errors.js'
import {
  cleanupFixtures,
  createFixture,
  manifest,
  remoteEntry,
  state,
} from '@electron/services/sync/webdavSync/engineTestSupport.js'

afterEach(cleanupFixtures)

describe('WebDavSyncEngine integrity', () => {
  it('recovers after a crash-like CAS failure by reusing the immutable content object', async () => {
    const fixture = await createFixture({ failManifestWrites: 3 })
    await fs.writeFile(path.join(fixture.root, 'local.txt'), 'local')

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({
      code: 'precondition_failed',
    })
    expect(fixture.remote.write).toHaveBeenCalledOnce()

    await expect(fixture.engine.sync(fixture.root)).resolves.toMatchObject({ uploaded: 1 })
    expect(fixture.remote.write).toHaveBeenCalledOnce()
  })

  it('does not mutate local files before the manifest CAS succeeds', async () => {
    const body = Buffer.from('remote note')
    const fixture = await createFixture({
      failManifestWrites: 3,
      remoteFiles: { 'note.md': body },
      remoteManifest: manifest([remoteEntry('note.md', body)]),
    })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({
      code: 'precondition_failed',
    })
    await expect(fs.stat(path.join(fixture.root, 'note.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(fixture.invalidateWorkspace).not.toHaveBeenCalled()

    await expect(fixture.engine.sync(fixture.root)).resolves.toMatchObject({ downloaded: 1 })
    await expect(fs.readFile(path.join(fixture.root, 'note.md'), 'utf8')).resolves.toBe(
      'remote note',
    )
  })

  it('invalidates paths applied before a later local operation fails', async () => {
    const first = Buffer.from('first remote note')
    const missing = Buffer.from('missing remote note')
    const fixture = await createFixture({
      remoteFiles: { 'a.md': first },
      remoteManifest: manifest([remoteEntry('a.md', first), remoteEntry('b.md', missing)]),
    })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({ code: 'remote_io' })
    await expect(fs.readFile(path.join(fixture.root, 'a.md'), 'utf8')).resolves.toBe(
      'first remote note',
    )
    expect(fixture.remote.writeManifest).toHaveBeenCalledOnce()
    expect(fixture.invalidateWorkspace).toHaveBeenCalledWith(fixture.root, ['a.md'])
  })

  it('keeps the primary sync error when batch invalidation also fails', async () => {
    const body = Buffer.from('remote note')
    const fixture = await createFixture({
      remoteFiles: { 'note.md': body },
      remoteManifest: manifest([remoteEntry('note.md', body)]),
    })
    fixture.remote.writeManifest.mockRejectedValueOnce(new Error('manifest failed'))
    fixture.invalidateWorkspace.mockRejectedValueOnce(new Error('invalidation failed'))

    await expect(fixture.engine.sync(fixture.root)).rejects.toThrow('manifest failed')
    expect(fixture.engine.cancel(fixture.root)).toBe(false)
  })

  it('remains active until invalidation finishes', async () => {
    const body = Buffer.from('remote note')
    const fixture = await createFixture({
      remoteFiles: { 'note.md': body },
      remoteManifest: manifest([remoteEntry('note.md', body)]),
    })
    let finishInvalidation!: () => void
    const invalidating = new Promise<void>((resolve) => {
      fixture.invalidateWorkspace.mockImplementation(
        () =>
          new Promise<undefined>((finish) => {
            finishInvalidation = () => finish(undefined)
            resolve()
          }),
      )
    })

    const pending = fixture.engine.sync(fixture.root)
    await invalidating
    expect(fixture.engine.cancel(fixture.root)).toBe(true)
    finishInvalidation()
    await expect(pending).resolves.toMatchObject({ downloaded: 1 })
  })

  it('refuses to bootstrap a manifest from an incomplete remote scan', async () => {
    const fixture = await createFixture({
      maxFileSize: 4,
      remoteFiles: { 'large.bin': Buffer.from('large') },
      remoteManifest: null,
    })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({ code: 'validation' })
    expect(fixture.remote.writeManifest).not.toHaveBeenCalled()
  })

  it('fails closed when an initialized workspace loses its remote manifest', async () => {
    const oldBody = Buffer.from('old content')
    const prior = remoteEntry('old.md', oldBody)
    const fixture = await createFixture({
      initialState: state([prior]),
      remoteFiles: { 'old.md': oldBody },
      remoteManifest: null,
    })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({
      code: 'precondition_failed',
    })
    await expect(fs.stat(path.join(fixture.root, 'old.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    expect(fixture.remote.list).not.toHaveBeenCalled()
    expect(fixture.remote.writeManifest).not.toHaveBeenCalled()
  })

  it('treats orphaned remote sync objects as initialization evidence', async () => {
    const fixture = await createFixture({
      remoteFiles: { [`.marklab-sync/objects/${'a'.repeat(64)}`]: Buffer.from('orphan') },
      remoteManifest: null,
    })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({
      code: 'precondition_failed',
    })
    expect(fixture.remote.writeManifest).not.toHaveBeenCalled()
  })

  it('fails closed when an empty sync metadata directory survives beside legacy files', async () => {
    const fixture = await createFixture({
      remoteFiles: { 'legacy.md': Buffer.from('legacy') },
      remoteManifest: null,
    })
    const hasSyncMetadata = vi.fn(async () => true)
    Object.assign(fixture.remote, { hasSyncMetadata })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({
      code: 'precondition_failed',
    })
    expect(hasSyncMetadata).toHaveBeenCalledOnce()
    expect(fixture.remote.list).not.toHaveBeenCalled()
    expect(fixture.remote.writeManifest).not.toHaveBeenCalled()
  })

  it.each([undefined, 'W/"manifest-1"'])(
    'rejects an existing manifest with ETag %s',
    async (etag) => {
      const fixture = await createFixture()
      fixture.remote.readManifest.mockResolvedValue({
        manifest: manifest([]),
        etag: etag as string,
      })
      await fs.writeFile(path.join(fixture.root, 'local.txt'), 'local')

      await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({ code: 'validation' })
      expect(fixture.remote.write).not.toHaveBeenCalled()
      expect(fixture.remote.writeManifest).not.toHaveBeenCalled()
      expect(fixture.mutationBoundary).not.toHaveBeenCalled()
    },
  )

  it('rejects portable aliases across local and remote snapshots before writing a manifest', async () => {
    const remoteBody = Buffer.from('remote')
    const fixture = await createFixture({
      remoteFiles: { 'notes/a.md': remoteBody },
      remoteManifest: manifest([remoteEntry('notes/a.md', remoteBody)]),
    })
    await fs.mkdir(path.join(fixture.root, 'Notes'), { recursive: true })
    await fs.writeFile(path.join(fixture.root, 'Notes', 'A.md'), 'local')

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({ code: 'validation' })
    expect(fixture.remote.writeManifest).not.toHaveBeenCalled()
  })

  it('rejects an unwritable projected manifest before uploading content objects', async () => {
    const fixture = await createFixture()
    await fs.writeFile(path.join(fixture.root, 'local.txt'), 'local')
    const assertManifestWritable = vi.fn(() => {
      throw new WebDavError('INVALID_REQUEST')
    })
    Object.assign(fixture.remote, { assertManifestWritable })

    await expect(fixture.engine.sync(fixture.root)).rejects.toMatchObject({ code: 'validation' })
    expect(assertManifestWritable).toHaveBeenCalledOnce()
    expect(fixture.remote.write).not.toHaveBeenCalled()
    expect(fixture.remote.writeManifest).not.toHaveBeenCalled()
  })
})
