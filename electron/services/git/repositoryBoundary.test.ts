import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { GitService } from '@electron/services/git/service'
import {
  createRemoteFixture,
  removeRemoteFixture,
  type RemoteFixture,
} from '@electron/services/git/testSupport'

const fixtures: RemoteFixture[] = []

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await removeRemoteFixture(fixture)
})

const fixture = async (): Promise<RemoteFixture> => {
  const created = await createRemoteFixture()
  fixtures.push(created)
  return created
}

describe('GitService exact workspace boundary', () => {
  it('does not grant a nested workspace access to its parent repository', async () => {
    const { local } = await fixture()
    const nested = path.join(local, 'nested-workspace')
    await fs.mkdir(nested)
    const service = new GitService()

    await expect(service.discover(nested)).resolves.toMatchObject({ is_repository: false })
    await expect(service.status(nested)).resolves.toMatchObject({
      repo: { is_repository: false },
    })
    await expect(service.fileDiff(nested, 'README.md', 'unstaged')).rejects.toThrow(
      'workspace root',
    )
    await expect(service.commitAll(nested, 'must not escape')).rejects.toThrow('workspace root')
    await expect(service.remoteStatus(nested)).rejects.toThrow('workspace root')
    await expect(
      service.setRemote(nested, 'boundary-test', 'https://example.com/repo.git'),
    ).rejects.toThrow('workspace root')
  })

  it('allows init to create an exact nested repository instead of adopting the parent', async () => {
    const { local } = await fixture()
    const nested = path.join(local, 'nested-init')
    await fs.mkdir(nested)

    const repository = await new GitService().init(nested)

    expect(repository.is_repository).toBe(true)
    expect(await fs.realpath(repository.workdir ?? '')).toBe(await fs.realpath(nested))
  })
})
