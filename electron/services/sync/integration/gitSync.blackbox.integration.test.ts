import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { GitService } from '@electron/services/git/service.js'
import {
  commitFile,
  createRemoteFixture,
  gitTestCommand,
  removeRemoteFixture,
  type RemoteFixture,
} from '@electron/services/git/testSupport.js'

const fixtures: RemoteFixture[] = []

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map(removeRemoteFixture))
})

describe('Git synchronization protocol', { timeout: 30_000 }, () => {
  it('pushes, fetches, and pulls against a real bare remote', async () => {
    const fixture = await createRemoteFixture()
    fixtures.push(fixture)
    const service = new GitService()

    await commitFile(fixture.local, 'from-local.md', 'local change\n', 'local change')
    await service.push(fixture.local)
    expect(await gitTestCommand(fixture.remote, ['show', 'main:from-local.md'])).toBe(
      'local change\n',
    )

    await gitTestCommand(fixture.seed, ['pull', '--ff-only'])
    await commitFile(fixture.seed, 'from-remote.md', 'remote change\n', 'remote change')
    await gitTestCommand(fixture.seed, ['push'])
    const fetched = await service.fetch(fixture.local)
    expect(fetched).toMatchObject({ branch: 'main', behind: 1 })
    expect(await gitTestCommand(fixture.local, ['show', 'origin/main:from-remote.md'])).toBe(
      'remote change\n',
    )

    const pulled = await service.pull(fixture.local)
    expect(pulled).toMatchObject({ ahead: 0, behind: 0 })
    const localContent = await fs.readFile(path.join(fixture.local, 'from-remote.md'), 'utf8')
    expect(localContent.replaceAll('\r\n', '\n')).toBe('remote change\n')
  })
})
