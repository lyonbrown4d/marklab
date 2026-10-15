import { compareChanges, parsePorcelainStatus, runGit } from '@electron/services/git/helpers'
import type { GitRepoInfo, GitStatusSnapshot } from '@electron/services/git/types'

export const gitValue = async (root: string, args: string[]): Promise<string | null> => {
  const result = await runGit(root, args, { allowFailure: true })
  return result.stdout.trim() || null
}

export const readRepoInfo = async (root: string): Promise<GitRepoInfo> => {
  const [workdir, gitDir, branch, head] = await Promise.all([
    gitValue(root, ['rev-parse', '--show-toplevel']),
    gitValue(root, ['rev-parse', '--absolute-git-dir']),
    gitValue(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
    gitValue(root, ['rev-parse', '--verify', 'HEAD']),
  ])
  return { is_repository: true, workdir, git_dir: gitDir, branch, head }
}

export const readStatusSnapshot = async (root: string): Promise<GitStatusSnapshot> => {
  const repo = await readRepoInfo(root)
  const { stdout } = await runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const changes = parsePorcelainStatus(stdout)
  return {
    repo,
    staged: changes.staged.sort(compareChanges),
    unstaged: changes.unstaged.sort(compareChanges),
    untracked: changes.untracked.sort(compareChanges),
    conflicts: changes.conflicts.sort(compareChanges),
  }
}

export const commitIdentityArgs = async (root: string): Promise<string[]> => {
  const [name, email] = await Promise.all([
    gitValue(root, ['config', 'user.name']),
    gitValue(root, ['config', 'user.email']),
  ])
  return [
    ...(!name ? ['-c', 'user.name=marklab'] : []),
    ...(!email ? ['-c', 'user.email=marklab@local'] : []),
  ]
}
