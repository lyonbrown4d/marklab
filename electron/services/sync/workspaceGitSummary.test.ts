import { describe, expect, it, vi } from 'vitest'

import type { GitService } from '@electron/services/git/service'
import { readWorkspaceGitSummary } from '@electron/services/sync/workspaceGitSummary'

describe('readWorkspaceGitSummary', () => {
  it('returns a structured non-repository result without requesting repository status', async () => {
    const git = createGitService()
    git.discover.mockResolvedValueOnce({ is_repository: false })

    await expect(readWorkspaceGitSummary(git as never, 'D:/notes')).resolves.toEqual({
      status: 'not_repository',
    })
    expect(git.status).not.toHaveBeenCalled()
    expect(git.remoteStatus).not.toHaveBeenCalled()
  })

  it('combines repository, worktree and remote state into a safe summary', async () => {
    const git = createGitService()
    git.discover.mockResolvedValueOnce({
      is_repository: true,
      workdir: 'D:/notes',
      git_dir: 'D:/notes/.git',
      branch: 'main',
      head: 'abc123',
    })
    git.status.mockResolvedValueOnce({
      repo: { is_repository: true, branch: 'main', head: 'abc123' },
      staged: [{ path: 'saved.md', status: 'modified', detail: 'M ' }],
      unstaged: [{ path: 'draft.md', status: 'modified', detail: ' M' }],
      untracked: [],
      conflicts: [],
    })
    git.remoteStatus.mockResolvedValueOnce({
      remotes: [
        {
          name: 'origin',
          fetch_url: 'https://example.test/notes.git',
          push_url: 'https://example.test/notes.git',
        },
      ],
      branch: 'main',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      detached: false,
    })

    await expect(readWorkspaceGitSummary(git as never, 'D:/notes')).resolves.toMatchObject({
      status: 'ready',
      branch: 'main',
      head: 'abc123',
      upstream: 'origin/main',
      ahead: 2,
      behind: 1,
      clean: false,
      changeCount: 2,
      conflictCount: 0,
      remotes: [{ name: 'origin' }],
    })
  })

  it('maps Git detection failures to a stable renderer-safe result', async () => {
    const git = createGitService()
    git.discover.mockRejectedValueOnce(new Error('command exposed D:/secret/path'))

    await expect(readWorkspaceGitSummary(git as never, 'D:/notes')).resolves.toEqual({
      status: 'error',
      code: 'git_detection_failed',
      message: 'Unable to inspect Git for this workspace',
    })
  })

  it('counts each changed path once across Git status sections', async () => {
    const git = createGitService()
    git.discover.mockResolvedValueOnce({ is_repository: true, branch: 'main' })
    git.status.mockResolvedValueOnce({
      repo: { is_repository: true, branch: 'main' },
      staged: [{ path: 'note.md', status: 'modified', detail: 'M ' }],
      unstaged: [{ path: 'note.md', status: 'modified', detail: ' M' }],
      untracked: [{ path: 'new.md', status: 'untracked', detail: '??' }],
      conflicts: [{ path: 'note.md', status: 'conflicted', detail: 'UU' }],
    })

    await expect(readWorkspaceGitSummary(git as never, 'D:/notes')).resolves.toMatchObject({
      status: 'ready',
      changeCount: 2,
      conflictCount: 1,
    })
  })
})

const createGitService = () => ({
  discover: vi.fn<GitService['discover']>(async () => ({ is_repository: false })),
  remoteStatus: vi.fn<GitService['remoteStatus']>(async () => ({
    remotes: [],
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    detached: false,
  })),
  status: vi.fn<GitService['status']>(async () => ({
    repo: { is_repository: false },
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
  })),
})
