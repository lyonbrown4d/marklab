import { describe, expect, it } from 'vitest'

import { buildSafeGitArgs } from '@electron/services/git/gitPolicy.js'

describe('safe Git command policy', () => {
  it('disables executable repository features and restricts transports', async () => {
    const args = await buildSafeGitArgs(['status', '--porcelain'])

    expect(args).toEqual(
      expect.arrayContaining([
        '-c',
        'core.fsmonitor=false',
        'core.sshCommand=ssh',
        'commit.gpgSign=false',
        'push.gpgSign=false',
        'diff.external=',
        'protocol.allow=never',
        'protocol.https.allow=always',
        'protocol.ssh.allow=always',
        'protocol.file.allow=always',
      ]),
    )
    const hooksConfig = args.find((arg) => arg.startsWith('core.hooksPath='))
    expect(hooksConfig).toMatch(/^core\.hooksPath=.+marklab-git-hooks-/)
    expect(args.slice(-2)).toEqual(['status', '--porcelain'])
  })
})
