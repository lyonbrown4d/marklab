import { describe, expect, it } from 'vitest'

import { GitOperationError, redactGitCredentials } from '@electron/services/git/errors'

describe('git credential redaction', () => {
  it('redacts URL user info from messages', () => {
    expect(
      redactGitCredentials('unable to access https://user:super-secret@example.com/repo.git'),
    ).toBe('unable to access https://***@example.com/repo.git')
  })

  it('redacts through the last user-info delimiter', () => {
    expect(redactGitCredentials('https://user:p@ss@example.com/repo.git')).toBe(
      'https://***@example.com/repo.git',
    )
  })

  it('does not retain credentials in a wrapped cause', () => {
    const error = new GitOperationError(
      'git_command_failed',
      'fetch https://user:super-secret@example.com/repo.git failed',
      new Error('https://user:super-secret@example.com/repo.git failed'),
    )

    expect(String(error)).not.toContain('super-secret')
    expect(String(error.cause)).not.toContain('super-secret')
  })
})
