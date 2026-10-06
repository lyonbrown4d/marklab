import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { GitService } from '@electron/services/git/service'
import {
  commitFile,
  createRemoteFixture,
  gitTestCommand,
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

describe('GitService remote status', { timeout: 30_000 }, () => {
  it('returns remotes, branch, upstream and divergence counts', async () => {
    const { local, remote, seed } = await fixture()
    await commitFile(local, 'local.md', 'local\n', 'local change')
    await commitFile(seed, 'remote.md', 'remote\n', 'remote change')
    await gitTestCommand(seed, ['push'])
    await gitTestCommand(local, ['fetch', '--prune', 'origin'])
    await gitTestCommand(local, [
      'config',
      'remote.origin.pushurl',
      'ssh://git@example.com/team/repo.git',
    ])

    const status = await new GitService().remoteStatus(local)

    expect(status).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      ahead: 1,
      behind: 1,
      detached: false,
    })
    expect(status.remotes).toEqual([
      {
        name: 'origin',
        fetch_url: remote,
        push_url: 'ssh://***@example.com/team/repo.git',
      },
    ])
  })

  it('returns null upstream and zero divergence when none is configured', async () => {
    const { local } = await fixture()
    await gitTestCommand(local, ['branch', '--unset-upstream'])

    await expect(new GitService().remoteStatus(local)).resolves.toMatchObject({
      branch: 'main',
      upstream: null,
      ahead: 0,
      behind: 0,
      detached: false,
    })
  })

  it('reports detached HEAD explicitly', async () => {
    const { local } = await fixture()
    await gitTestCommand(local, ['checkout', '--detach'])

    await expect(new GitService().remoteStatus(local)).resolves.toMatchObject({
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      detached: true,
    })
  })
})

describe('GitService remote configuration', { timeout: 30_000 }, () => {
  it('sets and removes a remote using a local path containing spaces', async () => {
    const { local, remote } = await fixture()
    const spaced = path.join(path.dirname(remote), 'remote with spaces.git')
    await fs.rename(remote, spaced)
    const service = new GitService()

    await service.setRemote(local, 'backup', spaced)
    expect((await service.remoteStatus(local)).remotes).toContainEqual({
      name: 'backup',
      fetch_url: spaced,
      push_url: spaced,
    })
    await service.setRemote(local, 'backup', remote)
    expect((await service.remoteStatus(local)).remotes).toContainEqual({
      name: 'backup',
      fetch_url: remote,
      push_url: remote,
    })
    await service.removeRemote(local, 'backup')
    expect((await service.remoteStatus(local)).remotes.map((item) => item.name)).not.toContain(
      'backup',
    )
  })

  it('rejects invalid configuration before invoking git', async () => {
    const { local } = await fixture()
    const service = new GitService()

    await expect(service.setRemote(local, '-evil', 'https://example.com/repo')).rejects.toThrow(
      'remote name',
    )
    await expect(service.setRemote(local, 'safe', 'https://example.com/repo\n-x')).rejects.toThrow(
      'remote URL',
    )
  })
})

describe('GitService synchronization', { timeout: 30_000 }, () => {
  it('fetches all remotes with pruning by default and supports a named remote', async () => {
    const { local, seed } = await fixture()
    await commitFile(seed, 'remote.md', 'remote\n', 'remote change')
    await gitTestCommand(seed, ['push'])
    const service = new GitService()

    await service.fetch(local)
    expect(await gitTestCommand(local, ['rev-parse', 'refs/remotes/origin/main'])).toBe(
      await gitTestCommand(seed, ['rev-parse', 'HEAD']),
    )
    await expect(service.fetch(local, 'origin')).resolves.toMatchObject({ branch: 'main' })
  })

  it('fetches every remote and prunes deleted tracking branches', async () => {
    const { local, remote, seed } = await fixture()
    const service = new GitService()
    await service.setRemote(local, 'backup', remote)
    await gitTestCommand(seed, ['checkout', '-b', 'obsolete'])
    await commitFile(seed, 'obsolete.md', 'obsolete\n', 'obsolete branch')
    await gitTestCommand(seed, ['push', '-u', 'origin', 'obsolete'])
    await gitTestCommand(seed, ['checkout', 'main'])

    await service.fetch(local)
    await expect(gitTestCommand(local, ['rev-parse', 'origin/obsolete'])).resolves.toBeTruthy()
    await expect(gitTestCommand(local, ['rev-parse', 'backup/obsolete'])).resolves.toBeTruthy()

    await gitTestCommand(seed, ['push', 'origin', '--delete', 'obsolete'])
    await service.fetch(local)
    await expect(gitTestCommand(local, ['rev-parse', 'origin/obsolete'])).rejects.toThrow()
    await expect(gitTestCommand(local, ['rev-parse', 'backup/obsolete'])).rejects.toThrow()
  })

  it('pulls only a clean worktree and rejects dirty or conflicted repositories', async () => {
    const { local, seed } = await fixture()
    const service = new GitService()
    await fs.writeFile(path.join(local, 'dirty.md'), 'dirty\n')
    await expect(service.pull(local)).rejects.toThrow('clean worktree')
    await fs.rm(path.join(local, 'dirty.md'))

    await commitFile(seed, 'remote.md', 'remote\n', 'remote change')
    await gitTestCommand(seed, ['push'])
    await service.pull(local)
    expect(
      (await fs.readFile(path.join(local, 'remote.md'), 'utf8')).replaceAll('\r\n', '\n'),
    ).toBe('remote\n')

    await gitTestCommand(local, ['checkout', '-b', 'conflict-side'])
    await commitFile(local, 'README.md', 'side\n', 'side')
    await gitTestCommand(local, ['checkout', 'main'])
    await commitFile(local, 'README.md', 'main\n', 'main')
    await gitTestCommand(local, ['merge', 'conflict-side']).catch(() => '')
    await expect(service.pull(local)).rejects.toThrow('conflicts')
  })

  it('invalidates the cached worktree status after pulling', async () => {
    const { local, seed } = await fixture()
    const service = new GitService()
    await commitFile(seed, 'fresh.md', 'fresh\n', 'fresh remote change')
    await gitTestCommand(seed, ['push'])
    const now = vi.spyOn(Date, 'now').mockReturnValue(100)
    try {
      const before = await service.status(local)
      await service.pull(local)

      const after = await service.status(local)
      expect(after.repo.head).not.toBe(before.repo.head)
      expect(after.repo.head).toBe((await gitTestCommand(local, ['rev-parse', 'HEAD'])).trim())
    } finally {
      now.mockRestore()
    }
  })

  it('pushes an existing upstream and can establish the first upstream', async () => {
    const { local } = await fixture()
    const service = new GitService()
    await commitFile(local, 'existing.md', 'existing\n', 'existing upstream')
    await service.push(local)
    expect(await gitTestCommand(local, ['rev-parse', 'HEAD'])).toBe(
      await gitTestCommand(local, ['rev-parse', 'origin/main']),
    )

    await gitTestCommand(local, ['checkout', '-b', 'topic'])
    await commitFile(local, 'topic.md', 'topic\n', 'topic')
    await expect(service.push(local)).rejects.toThrow('upstream')
    await service.push(local, { setUpstream: true, remote: 'origin' })
    expect((await gitTestCommand(local, ['rev-parse', '--abbrev-ref', '@{upstream}'])).trim()).toBe(
      'origin/topic',
    )
  })

  it('honors an explicit remote and setUpstream even when an upstream already exists', async () => {
    const { local, remote } = await fixture()
    const service = new GitService()
    await service.setRemote(local, 'backup', remote)
    await commitFile(local, 'backup.md', 'backup\n', 'backup push')

    await service.push(local, { remote: 'backup' })
    expect((await gitTestCommand(local, ['rev-parse', 'backup/main'])).trim()).toBe(
      (await gitTestCommand(local, ['rev-parse', 'HEAD'])).trim(),
    )

    await commitFile(local, 'backup-upstream.md', 'upstream\n', 'change upstream')
    await service.push(local, { remote: 'backup', setUpstream: true })
    expect((await gitTestCommand(local, ['rev-parse', '--abbrev-ref', '@{upstream}'])).trim()).toBe(
      'backup/main',
    )
  })

  it('rejects pushing from detached HEAD', async () => {
    const { local } = await fixture()
    await gitTestCommand(local, ['checkout', '--detach'])
    await expect(new GitService().push(local)).rejects.toThrow('detached HEAD')
  })

  it('redacts credentials from git failures', async () => {
    const { local } = await fixture()
    const secretUrl = 'https://user:super-secret@127.0.0.1:1/repo.git'
    const service = new GitService()
    await gitTestCommand(local, ['remote', 'add', 'private', secretUrl])

    const error = await service.fetch(local, 'private').catch((failure: unknown) => failure)

    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain('super-secret')
    expect(String((error as Error).cause)).not.toContain('super-secret')
  })
})
