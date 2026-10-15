import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createLocalFixture,
  removeLocalFixtures,
} from '@electron/services/git/integration/localFixture'
import { assertSafeRepositoryConfig } from '@electron/services/git/repository'
import { gitTestCommand } from '@electron/services/git/testSupport'

const roots: string[] = []
afterEach(() => removeLocalFixtures(roots))

const appendConfig = async (root: string, filename: string, key: string, value: string) => {
  const parts = key.split('.')
  const section = parts.shift()!
  const name = parts.pop()!
  const subsection = parts.join('.')
  const heading = subsection ? `[${section} "${subsection}"]` : `[${section}]`
  await fs.appendFile(path.join(root, '.git', filename), `\n${heading}\n\t${name} = ${value}\n`)
}

describe('Git repository executable configuration overlays', { timeout: 30_000 }, () => {
  it.each(['filter.untrusted.process', 'merge.untrusted.driver'])(
    'refuses worktree overlay %s before executing commands',
    async (key) => {
      const { root, service, write } = await createLocalFixture(roots)
      const sentinel = path.join(root, 'executed')
      await write('untrusted.sh', `#!/bin/sh\nprintf executed > '${sentinel}'\n`)
      await fs.chmod(path.join(root, 'untrusted.sh'), 0o755)
      await gitTestCommand(root, ['config', 'extensions.worktreeConfig', 'true'])
      await appendConfig(root, 'config.worktree', key, path.join(root, 'untrusted.sh'))
      await expect(service.stage(root, ['base.md'])).rejects.toMatchObject({
        code: 'git_unsafe_configuration',
      })
      await expect(service.merge(root, 'main')).rejects.toMatchObject({
        code: 'git_unsafe_configuration',
      })
      await expect(fs.access(sentinel)).rejects.toThrow()
    },
  )

  it.each([
    'gpg.program',
    'gpg.openpgp.program',
    'gpg.x509.program',
    'gpg.ssh.program',
    'gpg.ssh.defaultKeyCommand',
  ])('refuses repository %s without weakening signature verification', async (key) => {
    const { root, service, write } = await createLocalFixture(roots)
    const sentinel = path.join(root, 'verified-externally')
    await write('verifier.sh', `#!/bin/sh\nprintf executed > '${sentinel}'\n`)
    await fs.chmod(path.join(root, 'verifier.sh'), 0o755)
    await gitTestCommand(root, ['config', 'merge.verifySignatures', 'true'])
    await appendConfig(root, 'config', key, path.join(root, 'verifier.sh'))
    await expect(service.merge(root, 'main')).rejects.toMatchObject({
      code: 'git_unsafe_configuration',
    })
    expect((await gitTestCommand(root, ['config', '--get', 'merge.verifySignatures'])).trim()).toBe(
      'true',
    )
    await expect(fs.access(sentinel)).rejects.toThrow()
  })

  it('accepts enabled worktree configuration with no overlay, and checks an overlay created later', async () => {
    const { root, service } = await createLocalFixture(roots)
    await gitTestCommand(root, ['config', 'extensions.worktreeConfig', 'true'])
    await expect(service.status(root)).resolves.toMatchObject({ repo: { is_repository: true } })
    await appendConfig(root, 'config.worktree', 'gpg.ssh.program', '/untrusted/verifier')
    await expect(service.status(root)).rejects.toMatchObject({ code: 'git_unsafe_configuration' })
  })

  it.each(['config', 'config.worktree'])(
    'fails closed when %s cannot be parsed',
    async (filename) => {
      const { root } = await createLocalFixture(roots)
      if (filename === 'config.worktree')
        await gitTestCommand(root, ['config', 'extensions.worktreeConfig', 'true'])
      await fs.appendFile(path.join(root, '.git', filename), '\n[invalid section\n')
      await expect(assertSafeRepositoryConfig(root)).rejects.toMatchObject({
        code: 'git_unsafe_configuration',
      })
    },
  )
})
