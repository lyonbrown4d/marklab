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

describe('WebDavSyncEngine local apply preconditions', () => {
  it('does not overwrite a live local file changed after scanning', async () => {
    const oldBody = Buffer.from('old local')
    const remoteBody = Buffer.from('remote update')
    const externalBody = Buffer.from('external edit')
    const prior = remoteEntry('note.md', oldBody)
    let root = ''
    const fixture = await createFixture({
      beforeMutation: async () => fs.writeFile(path.join(root, 'note.md'), externalBody),
      initialState: state([prior]),
      remoteFiles: { 'note.md': remoteBody },
      remoteManifest: manifest([remoteEntry('note.md', remoteBody)]),
    })
    root = fixture.root
    await fs.writeFile(path.join(root, 'note.md'), oldBody)

    await expect(fixture.engine.sync(root)).rejects.toMatchObject({ code: 'conflict' })
    await expect(fs.readFile(path.join(root, 'note.md'))).resolves.toEqual(externalBody)
    expect(fixture.stateStore.save).not.toHaveBeenCalled()
    expect(fixture.invalidateWorkspace).not.toHaveBeenCalled()
  })

  it('does not delete a local file changed after scanning', async () => {
    const oldBody = Buffer.from('old local')
    const externalBody = Buffer.from('rebuilt externally')
    const prior = remoteEntry('deleted.md', oldBody)
    const tombstone = {
      ...prior,
      size: 0,
      deletedAt: '2026-01-03T00:00:00.000Z',
    }
    let root = ''
    const fixture = await createFixture({
      beforeMutation: async () => fs.writeFile(path.join(root, 'deleted.md'), externalBody),
      initialState: state([prior]),
      remoteManifest: manifest([tombstone]),
    })
    root = fixture.root
    await fs.writeFile(path.join(root, 'deleted.md'), oldBody)

    await expect(fixture.engine.sync(root)).rejects.toMatchObject({ code: 'conflict' })
    await expect(fs.readFile(path.join(root, 'deleted.md'))).resolves.toEqual(externalBody)
    expect(fixture.stateStore.save).not.toHaveBeenCalled()
    expect(fixture.invalidateWorkspace).not.toHaveBeenCalled()
  })

  it('invalidates an earlier download when a later absent-path precondition fails', async () => {
    const first = Buffer.from('first remote')
    const second = Buffer.from('second remote')
    const external = Buffer.from('new local file')
    let root = ''
    const fixture = await createFixture({
      beforeMutation: async () => fs.writeFile(path.join(root, 'b.md'), external),
      remoteFiles: { 'a.md': first, 'b.md': second },
      remoteManifest: manifest([remoteEntry('a.md', first), remoteEntry('b.md', second)]),
    })
    root = fixture.root

    await expect(fixture.engine.sync(root)).rejects.toMatchObject({ code: 'conflict' })
    await expect(fs.readFile(path.join(root, 'a.md'))).resolves.toEqual(first)
    await expect(fs.readFile(path.join(root, 'b.md'))).resolves.toEqual(external)
    expect(fixture.invalidateWorkspace).toHaveBeenCalledWith(root, ['a.md'])
  })
})
