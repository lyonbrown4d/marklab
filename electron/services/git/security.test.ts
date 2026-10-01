import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { GitService } from '@electron/services/git/service.js'
import {
  createRemoteFixture,
  gitTestCommand,
  removeRemoteFixture,
  type RemoteFixture,
} from '@electron/services/git/testSupport.js'

const fixtures: RemoteFixture[] = []

afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await removeRemoteFixture(fixture)
})

const fixture = async (): Promise<RemoteFixture> => {
  const created = await createRemoteFixture()
  fixtures.push(created)
  return created
}

const executableScript = async (scriptPath: string, body: string): Promise<void> => {
  await fs.writeFile(scriptPath, `#!/bin/sh\n${body}\n`)
  await fs.chmod(scriptPath, 0o755)
}

const appendLocalConfig = async (repository: string, key: string, value: string): Promise<void> => {
  const parts = key.split('.')
  const section = parts.shift() ?? ''
  const name = parts.pop() ?? ''
  const subsection = parts.join('.')
  const heading = subsection ? `[${section} "${subsection}"]` : `[${section}]`
  await fs.appendFile(
    path.join(repository, '.git', 'config'),
    `\n${heading}\n\t${name} = ${value}\n`,
  )
}

describe('GitService executable configuration isolation', () => {
  it('does not execute repository commit hooks', async () => {
    const { local, root } = await fixture()
    const sentinel = path.join(root, 'hook-executed')
    const hook = path.join(local, '.git', 'hooks', 'pre-commit')
    await executableScript(hook, `printf executed > '${sentinel.replaceAll('\\', '/')}'`)
    await fs.writeFile(path.join(local, 'safe.md'), 'safe\n')

    await new GitService().commitAll(local, 'safe commit')

    await expect(fs.stat(sentinel)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.each([
    ['core.fsmonitor', 'echo unsafe'],
    ['core.sshCommand', 'echo unsafe'],
    ['filter.evil.process', 'echo unsafe'],
    ['diff.evil.textconv', 'echo unsafe'],
    ['credential.helper', 'echo unsafe'],
    ['credential.https://example.com.helper', 'echo unsafe'],
    ['url.ext::evil.insteadOf', 'https://example.com/'],
  ])('rejects executable local config %s', async (key, value) => {
    const { local } = await fixture()
    await appendLocalConfig(local, key, value)

    await expect(new GitService().status(local)).rejects.toThrow('unsafe Git configuration')
  })
})

describe('GitService remote credential handling', () => {
  it('rejects password and query credentials before persisting a remote', async () => {
    const { local } = await fixture()
    const service = new GitService()

    await expect(
      service.setRemote(local, 'password', 'https://user:secret@example.com/repo.git'),
    ).rejects.toThrow('credentials')
    await expect(
      service.setRemote(local, 'query', 'https://example.com/repo.git?token=secret'),
    ).rejects.toThrow('query')
    await expect(
      service.setRemote(local, 'username', 'https://user@example.com/repo.git'),
    ).rejects.toThrow('credentials')
    expect(await gitTestCommand(local, ['remote'])).not.toContain('password')
    expect(await gitTestCommand(local, ['remote'])).not.toContain('query')
    expect(await gitTestCommand(local, ['remote'])).not.toContain('username')
  })

  it('redacts credentials from returned remote URLs', async () => {
    const { local } = await fixture()
    await gitTestCommand(local, [
      'config',
      'remote.origin.url',
      'https://user:secret@example.com/repo.git?token=secret',
    ])

    const status = await new GitService().remoteStatus(local)
    const serialized = JSON.stringify(status)

    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('token')
    expect(status.remotes[0]?.fetch_url).toContain('***')
  })
})
