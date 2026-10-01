import { describe, expect, it } from 'vitest'

import {
  validateBranchName,
  validateRemoteName,
  validateRemoteUrl,
} from '@electron/services/git/validation.js'

describe('git remote validation', () => {
  it.each(['origin', 'upstream-2', 'work.backup', 'team_remote'])(
    'accepts remote name %j',
    (name) => expect(validateRemoteName(name)).toBe(name),
  )

  it.each([
    '',
    '.',
    '-origin',
    'with space',
    'team/origin',
    'origin\nnext',
    'origin..backup',
    'origin.lock',
  ])('rejects remote name %j', (name) =>
    expect(() => validateRemoteName(name)).toThrow('remote name'),
  )

  it.each([
    'https://example.com/team/repo.git',
    'ssh://git@example.com/team/repo.git',
    'git@example.com:team/repo.git',
    'file:///tmp/repo.git',
    '../repo.git',
    'C:\\work\\repo.git',
    'repo.git',
  ])('accepts supported remote URL %j', (url) => expect(validateRemoteUrl(url)).toBe(url))

  it.each([
    '',
    '  ',
    '-upload-pack=evil',
    'ftp://example.com/repo',
    'https://x/repo\n--upload-pack=x',
    'https://x/repo\t--upload-pack=x',
    'ext::sh -c calc',
    'hg::https://example.com/repo',
    'custom://example.com/repo',
    'https://user:secret@example.com/repo.git',
    'https://user@example.com/repo.git',
    'ssh://git:secret@example.com/repo.git',
    'https://example.com/repo.git?access_token=secret',
    'ssh://git@example.com/repo.git#token',
    'git@-oProxyCommand=evil:repo.git',
    "git@example.com:repo'$(calc)'",
  ])('rejects unsafe remote URL %j', (url) =>
    expect(() => validateRemoteUrl(url)).toThrow('remote URL'),
  )
})

describe('git branch validation', () => {
  it.each(['main', 'feature/remote-sync', 'release-1.2'])('accepts branch name %j', (branch) =>
    expect(validateBranchName(branch)).toBe(branch),
  )

  it.each(['', '-main', 'feature..bad', 'feature//bad', 'main.lock', 'bad\nbranch', 'HEAD'])(
    'rejects branch name %j',
    (branch) => expect(() => validateBranchName(branch)).toThrow('branch name'),
  )
})
