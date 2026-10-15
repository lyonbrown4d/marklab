import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readUtf8RepoFile: vi.fn(),
  readGitTextBlob: vi.fn(),
}))

vi.mock('@electron/services/git/helpers', () => ({
  normalizeRepoRelativePath: (value: unknown) => String(value),
  readUtf8RepoFile: mocks.readUtf8RepoFile,
}))

vi.mock('@electron/services/git/blobPreview', () => ({ readGitTextBlob: mocks.readGitTextBlob }))

import { GitDiffReader } from '@electron/services/git/diff'

describe('GitDiffReader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readUtf8RepoFile.mockResolvedValue('worktree')
    mocks.readGitTextBlob.mockImplementation(async (_root: string, revision: string | null) =>
      revision === 'HEAD' ? 'head' : 'index',
    )
  })

  it('reads only the working tree for an untracked file', async () => {
    const result = await new GitDiffReader().fileDiff('/repo', 'note.md', 'untracked')

    expect(result).toEqual({
      modified_content: 'worktree',
      modified_label: 'Working Tree',
      old_path: null,
      original_content: '',
      original_label: 'Empty',
      path: 'note.md',
    })
    expect(mocks.readUtf8RepoFile).toHaveBeenCalledOnce()
    expect(mocks.readGitTextBlob).not.toHaveBeenCalled()
  })

  it('reads only HEAD and the index for a staged file', async () => {
    const result = await new GitDiffReader().fileDiff('/repo', 'note.md', 'staged')

    expect(result.original_content).toBe('head')
    expect(result.modified_content).toBe('index')
    expect(mocks.readGitTextBlob).toHaveBeenCalledTimes(2)
    expect(mocks.readUtf8RepoFile).not.toHaveBeenCalled()
    expect(result).not.toHaveProperty('unified_diff')
  })

  it('reads HEAD and the working tree for conflicts without generating a third diff payload', async () => {
    const result = await new GitDiffReader().fileDiff('/repo', 'note.md', 'conflicts')

    expect(result.original_content).toBe('head')
    expect(result.modified_content).toBe('worktree')
    expect(mocks.readGitTextBlob).toHaveBeenCalledOnce()
    expect(mocks.readUtf8RepoFile).toHaveBeenCalledOnce()
    expect(result).not.toHaveProperty('unified_diff')
  })

  it('falls back to HEAD only when the index has no blob for an unstaged file', async () => {
    mocks.readGitTextBlob.mockResolvedValueOnce(null).mockResolvedValueOnce('head')

    const result = await new GitDiffReader().fileDiff('/repo', 'note.md', 'unstaged')

    expect(result.original_content).toBe('head')
    expect(result.modified_content).toBe('worktree')
    expect(mocks.readGitTextBlob).toHaveBeenCalledTimes(2)
  })

  it('preserves an empty index blob instead of falling back to HEAD', async () => {
    mocks.readGitTextBlob.mockResolvedValueOnce('')
    const result = await new GitDiffReader().fileDiff('/repo', 'note.md', 'unstaged')
    expect(result.original_content).toBe('')
    expect(mocks.readGitTextBlob).toHaveBeenCalledOnce()
  })

  it('refuses metadata and traversal paths before reading a preview', async () => {
    for (const file of ['.git/config', 'dir/../note.md']) {
      await expect(new GitDiffReader().fileDiff('/repo', file, 'untracked')).rejects.toThrow()
    }
    expect(mocks.readGitTextBlob).not.toHaveBeenCalled()
    expect(mocks.readUtf8RepoFile).not.toHaveBeenCalled()
  })
})
