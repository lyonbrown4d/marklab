import { afterEach, describe, expect, it, vi } from 'vitest'

import { validateFilePath } from '@electron/services/git/pathSafety'

afterEach(() => vi.restoreAllMocks())

describe('Git file selection normalization boundaries', () => {
  it('preserves literal legal Unix filenames, including pathspec-like prefixes', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
    expect(validateFilePath(':(glob)*.md')).toBe(':(glob)*.md')
    expect(validateFilePath('--file.md')).toBe('--file.md')
  })

  it('refuses Windows components that could alias metadata or an alternate data stream', () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    for (const file of [
      '.git./config',
      '.git /config',
      'git~1/config',
      'file.md:stream',
      'dir?/file.md',
    ]) {
      expect(() => validateFilePath(file)).toThrow('inside the worktree')
    }
    expect(validateFilePath('nested/file.md')).toBe('nested/file.md')
  })
})
