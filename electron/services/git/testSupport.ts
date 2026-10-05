import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { simpleGit } from 'simple-git'

export type RemoteFixture = {
  root: string
  remote: string
  seed: string
  local: string
}

type RemoteFixtureOptions = {
  command?: (cwd: string, args: string[]) => Promise<string>
  createRoot?: () => Promise<string>
}

export const gitTestCommand = async (cwd: string, args: string[]): Promise<string> => {
  return String(await simpleGit({ baseDir: cwd, binary: 'git' }).raw(args))
}

export const createRemoteFixture = async (
  options: RemoteFixtureOptions = {},
): Promise<RemoteFixture> => {
  const command = options.command ?? gitTestCommand
  const root = await (
    options.createRoot ?? (() => fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-remote-')))
  )()
  const remote = path.join(root, 'remote.git')
  const seed = path.join(root, 'seed')
  const local = path.join(root, 'local')
  const fixture = { root, remote, seed, local }
  try {
    await fs.mkdir(seed)
    await command(seed, ['init', '-b', 'main'])
    await command(seed, ['config', 'user.name', 'Marklab Test'])
    await command(seed, ['config', 'user.email', 'marklab@example.test'])
    await fs.writeFile(path.join(seed, 'README.md'), 'initial\n')
    await command(seed, ['add', 'README.md'])
    await command(seed, ['commit', '-m', 'initial'])
    await fs.mkdir(remote)
    await command(remote, ['init', '--bare'])
    await command(seed, ['remote', 'add', 'origin', remote])
    await command(seed, ['push', '-u', 'origin', 'main'])
    await command(root, ['clone', '--branch', 'main', remote, local])
    await command(local, ['config', 'user.name', 'Marklab Test'])
    await command(local, ['config', 'user.email', 'marklab@example.test'])
    return fixture
  } catch (error) {
    let cleanupFailure: unknown
    try {
      await removeRemoteFixture(fixture)
    } catch (cleanupError) {
      cleanupFailure = cleanupError
    }
    if (cleanupFailure) {
      throw new AggregateError([error, cleanupFailure], 'Failed to create the Git remote fixture', {
        cause: error,
      })
    }
    throw error
  }
}

export const removeRemoteFixture = async (fixture: RemoteFixture): Promise<void> => {
  const root = path.resolve(fixture.root)
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('marklab-git-remote-')
  ) {
    throw new Error('Refusing to remove a path outside the git test fixture')
  }
  await fs.rm(root, { force: true, recursive: true })
}

export const commitFile = async (
  repository: string,
  relativePath: string,
  content: string,
  message: string,
): Promise<void> => {
  await fs.writeFile(path.join(repository, relativePath), content)
  await gitTestCommand(repository, ['add', '--', relativePath])
  await gitTestCommand(repository, ['commit', '-m', message])
}
