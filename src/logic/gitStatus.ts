import type { GitStatusSnapshot } from '@/services/gitApi'

export const gitStatusQueryKey = (rootPath: string) => ['git-status', rootPath] as const

export const countChangedFiles = (snapshot: GitStatusSnapshot | undefined) => {
  if (!snapshot?.repo.is_repository) return 0
  return new Set(
    [...snapshot.staged, ...snapshot.unstaged, ...snapshot.untracked, ...snapshot.conflicts].map(
      (change) => change.path,
    ),
  ).size
}

export const countGitConflicts = (snapshot: GitStatusSnapshot | undefined) => {
  if (!snapshot?.repo.is_repository) return 0
  return new Set(snapshot.conflicts.map((change) => change.path)).size
}
