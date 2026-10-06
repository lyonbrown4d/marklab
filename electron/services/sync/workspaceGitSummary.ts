import type { GitService } from '@electron/services/git/service'
import type { WorkspaceGitSummary } from '@/types/workspaceSync'

type GitSummaryService = Pick<GitService, 'discover' | 'remoteStatus' | 'status'>

export const readWorkspaceGitSummary = async (
  git: GitSummaryService,
  workspaceRoot: string,
): Promise<WorkspaceGitSummary> => {
  try {
    const repository = await git.discover(workspaceRoot)
    if (!repository.is_repository) return { status: 'not_repository' }

    const [worktree, remote] = await Promise.all([
      git.status(workspaceRoot),
      git.remoteStatus(workspaceRoot),
    ])
    const changedPaths = new Set([
      ...worktree.staged.map((entry) => entry.path),
      ...worktree.unstaged.map((entry) => entry.path),
      ...worktree.untracked.map((entry) => entry.path),
      ...worktree.conflicts.map((entry) => entry.path),
    ])
    const changeCount = changedPaths.size

    return {
      status: 'ready',
      branch: remote.branch ?? repository.branch ?? null,
      head: repository.head ?? null,
      upstream: remote.upstream,
      ahead: remote.ahead,
      behind: remote.behind,
      detached: remote.detached,
      clean: changeCount === 0,
      changeCount,
      conflictCount: worktree.conflicts.length,
      remotes: remote.remotes.map((candidate) => ({
        name: candidate.name,
        fetchUrl: candidate.fetch_url,
        pushUrl: candidate.push_url,
      })),
    }
  } catch {
    return {
      status: 'error',
      code: 'git_detection_failed',
      message: 'Unable to inspect Git for this workspace',
    }
  }
}
