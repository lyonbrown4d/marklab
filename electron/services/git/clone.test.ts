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

describe('GitService clone', () => {
  it('clones a selected branch into a missing target', async () => {
    const { root, remote } = await fixture()
    const target = path.join(root, 'selected-clone')

    const result = await new GitService().clone(remote, target, 'main')

    expect(result.cancelled).toBe(false)
    expect(result.repository).toMatchObject({ is_repository: true, branch: 'main' })
    expect(
      (await fs.readFile(path.join(target, 'README.md'), 'utf8')).replaceAll('\r\n', '\n'),
    ).toBe('initial\n')
  })

  it('allows an existing empty target directory', async () => {
    const { root, remote } = await fixture()
    const target = path.join(root, 'empty-target')
    await fs.mkdir(target)

    await expect(new GitService().clone(remote, target)).resolves.toMatchObject({
      cancelled: false,
    })
  })

  it('rejects a non-empty target without deleting user content', async () => {
    const { root, remote } = await fixture()
    const target = path.join(root, 'occupied')
    const existing = path.join(target, 'keep.txt')
    await fs.mkdir(target)
    await fs.writeFile(existing, 'keep me')

    await expect(new GitService().clone(remote, target)).rejects.toThrow('empty')
    await expect(fs.readFile(existing, 'utf8')).resolves.toBe('keep me')
  })

  it('validates the branch and remote URL before creating the target', async () => {
    const { root, remote } = await fixture()
    const invalidBranchTarget = path.join(root, 'invalid-branch')
    const invalidUrlTarget = path.join(root, 'invalid-url')
    const service = new GitService()

    await expect(service.clone(remote, invalidBranchTarget, '-bad')).rejects.toThrow('branch name')
    await expect(service.clone('', invalidUrlTarget)).rejects.toThrow('remote URL')
    await expect(fs.stat(invalidBranchTarget)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.stat(invalidUrlTarget)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('honors an already-aborted cancellation signal', async () => {
    const { root, remote } = await fixture()
    const target = path.join(root, 'cancelled')
    const controller = new AbortController()
    controller.abort()

    const error = await new GitService()
      .clone(remote, target, undefined, controller.signal)
      .catch((failure: unknown) => failure)

    expect(error).toMatchObject({ code: 'git_operation_cancelled' })
    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('cleans staging after clone failure without touching sibling content', async () => {
    const { root } = await fixture()
    const target = path.join(root, 'failed-clone')
    const sibling = path.join(root, 'keep.txt')
    await fs.writeFile(sibling, 'keep')

    await expect(new GitService().clone(path.join(root, 'missing.git'), target)).rejects.toThrow()

    await expect(fs.readFile(sibling, 'utf8')).resolves.toBe('keep')
    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await fs.readdir(root)).some((name) => name.includes('.marklab-clone-'))).toBe(false)
  })
})
