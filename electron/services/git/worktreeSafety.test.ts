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

describe('Git worktree diff path safety', () => {
  it('rejects a final symlink instead of reading outside the repository', async () => {
    const { local, root } = await fixture()
    const outside = path.join(root, 'outside.md')
    await fs.writeFile(outside, 'outside secret')
    await fs.symlink(outside, path.join(local, 'linked.md'), 'file')

    await expect(new GitService().fileDiff(local, 'linked.md', 'untracked')).rejects.toThrow(
      'symbolic link',
    )
  })

  it('rejects an intermediate directory symlink or junction escaping the repository', async () => {
    const { local, root } = await fixture()
    const outside = path.join(root, 'outside')
    await fs.mkdir(outside)
    await fs.writeFile(path.join(outside, 'secret.md'), 'outside secret')
    await fs.symlink(
      outside,
      path.join(local, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )

    await expect(new GitService().fileDiff(local, 'linked/secret.md', 'untracked')).rejects.toThrow(
      'symbolic link',
    )
  })
})
