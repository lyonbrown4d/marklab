import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { GitService } from '@electron/services/git/service'
import { gitTestCommand } from '@electron/services/git/testSupport'

export const createLocalFixture = async (roots: string[], initial = true) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-git-local-'))
  roots.push(root)
  const service = new GitService()
  await service.init(root)
  await gitTestCommand(root, ['config', 'user.name', 'Git test'])
  await gitTestCommand(root, ['config', 'user.email', 'test@local'])
  await gitTestCommand(root, ['config', 'core.autocrlf', 'false'])
  const write = async (file: string, content: string) => {
    await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await fs.writeFile(path.join(root, file), content)
  }
  const commit = async (file: string, content: string, message = file) => {
    await write(file, content)
    await service.stage(root, [file])
    await service.commitStaged(root, message)
    return (await gitTestCommand(root, ['rev-parse', 'HEAD'])).trim()
  }
  if (initial) await commit('base.md', 'base\n', 'initial')
  return { root, service, write, commit }
}

export const removeLocalFixtures = async (roots: string[]) => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
}
