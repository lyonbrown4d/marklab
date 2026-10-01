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

export const gitTestCommand = async (cwd: string, args: string[]): Promise<string> => {
  return String(await simpleGit({ baseDir: cwd, binary: 'git' }).raw(args))
}

export const createRemoteFixture = async (): Promise<RemoteFixture> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-remote-'))
  const remote = path.join(root, 'remote.git')
  const seed = path.join(root, 'seed')
  const local = path.join(root, 'local')
  await fs.mkdir(seed)
  await gitTestCommand(seed, ['init', '-b', 'main'])
  await gitTestCommand(seed, ['config', 'user.name', 'Marklab Test'])
  await gitTestCommand(seed, ['config', 'user.email', 'marklab@example.test'])
  await fs.writeFile(path.join(seed, 'README.md'), 'initial\n')
  await gitTestCommand(seed, ['add', 'README.md'])
  await gitTestCommand(seed, ['commit', '-m', 'initial'])
  await fs.mkdir(remote)
  await gitTestCommand(remote, ['init', '--bare'])
  await gitTestCommand(seed, ['remote', 'add', 'origin', remote])
  await gitTestCommand(seed, ['push', '-u', 'origin', 'main'])
  await gitTestCommand(root, ['clone', '--branch', 'main', remote, local])
  await gitTestCommand(local, ['config', 'user.name', 'Marklab Test'])
  await gitTestCommand(local, ['config', 'user.email', 'marklab@example.test'])
  return { root, remote, seed, local }
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
