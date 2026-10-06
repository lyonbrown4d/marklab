import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parsePorcelainStatus } from '@electron/services/git/helpers'
import { GitService } from '@electron/services/git/service'
import {
  createRemoteFixture,
  gitTestCommand,
  removeRemoteFixture,
  type RemoteFixture,
} from '@electron/services/git/testSupport'

const fixtures: RemoteFixture[] = []

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await removeRemoteFixture(fixture)
})

describe('porcelain v1 -z parsing', () => {
  it('maps the first rename path to the destination and the second to the source', async () => {
    const fixture = await createRemoteFixture()
    fixtures.push(fixture)
    await fs.rename(path.join(fixture.local, 'README.md'), path.join(fixture.local, 'RENAMED.md'))
    await gitTestCommand(fixture.local, ['add', '-A'])

    const status = await new GitService().status(fixture.local)

    expect(status.staged).toContainEqual({
      path: 'RENAMED.md',
      old_path: 'README.md',
      status: 'renamed',
      detail: 'index',
    })
  })

  it('maps a porcelain copy record using the same destination-source ordering', () => {
    expect(parsePorcelainStatus('C  copied.md\0source.md\0').staged).toEqual([
      {
        path: 'copied.md',
        old_path: 'source.md',
        status: 'copied',
        detail: 'index',
      },
    ])
  })

  it('maps a copy record emitted by Git to destination and source paths', async () => {
    const fixture = await createRemoteFixture()
    fixtures.push(fixture)
    await gitTestCommand(fixture.local, ['config', 'status.renames', 'copies'])
    await fs.copyFile(path.join(fixture.local, 'README.md'), path.join(fixture.local, 'COPIED.md'))
    await fs.copyFile(path.join(fixture.local, 'README.md'), path.join(fixture.local, 'MOVED.md'))
    await fs.rm(path.join(fixture.local, 'README.md'))
    await gitTestCommand(fixture.local, ['add', '-A'])

    const status = await new GitService().status(fixture.local)

    expect(status.staged).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          old_path: 'README.md',
          status: 'copied',
        }),
      ]),
    )
  })
})
