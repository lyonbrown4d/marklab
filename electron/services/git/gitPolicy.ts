import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { SimpleGitOptions } from 'simple-git'

const SAFE_CONFIG = [
  'core.fsmonitor=false',
  'core.sshCommand=ssh',
  'commit.gpgSign=false',
  'push.gpgSign=false',
  'diff.external=',
  'protocol.allow=never',
  'protocol.https.allow=always',
  'protocol.ssh.allow=always',
  'protocol.file.allow=always',
]

export const SAFE_SIMPLE_GIT_OPTIONS: Partial<SimpleGitOptions> = {
  unsafe: {
    allowUnsafeDiffExternal: true,
    allowUnsafeFsMonitor: true,
    allowUnsafeHooksPath: true,
    allowUnsafeProtocolOverride: true,
    allowUnsafeSshCommand: true,
  },
}

let hooksDirectory: Promise<string> | null = null

const safeHooksDirectory = (): Promise<string> => {
  hooksDirectory ??= fs
    .mkdtemp(path.join(os.tmpdir(), 'marklab-git-hooks-'))
    .then(async (directory) => {
      await fs.chmod(directory, 0o700).catch(() => undefined)
      return directory
    })
  return hooksDirectory
}

export const buildSafeGitArgs = async (args: string[]): Promise<string[]> => {
  const config = [`core.hooksPath=${await safeHooksDirectory()}`, ...SAFE_CONFIG]
  return [...config.flatMap((value) => ['-c', value]), ...args]
}
