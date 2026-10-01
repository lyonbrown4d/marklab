import type { Logger } from '@electron/services/logger.js'
import { GitOperationCoordinator } from '@electron/services/git/coordinator.js'
import { GitOperationError, redactGitUrl } from '@electron/services/git/errors.js'
import { parsePorcelainStatus, runGit } from '@electron/services/git/helpers.js'
import type { GitPushOptions, GitRemote, GitRemoteStatus } from '@electron/services/git/types.js'
import { validateRemoteName, validateRemoteUrl } from '@electron/services/git/validation.js'

type ParsedPushOptions = { remote: string | null; setUpstream: boolean }

export class GitRemoteOperations {
  constructor(
    private readonly coordinator: GitOperationCoordinator,
    private readonly logger: Logger,
  ) {}

  async status(root: string): Promise<GitRemoteStatus> {
    return this.coordinator.query(root, 'remote-status', () => this.readStatus(root))
  }

  async setRemote(root: string, remoteName: unknown, remoteUrl: unknown) {
    const name = validateRemoteName(remoteName)
    const url = validateRemoteUrl(remoteUrl)
    return this.coordinator.mutate(root, async () => {
      const existing = await runGit(root, ['remote', 'get-url', '--', name], {
        allowFailure: true,
      })
      const action = existing.stdout.trim() ? 'set-url' : 'add'
      await runGit(root, ['remote', action, '--', name, url])
      this.logger.info('git remote updated', { name, rootPath: root })
      return this.readStatus(root)
    })
  }

  async removeRemote(root: string, remoteName: unknown) {
    const name = validateRemoteName(remoteName)
    return this.coordinator.mutate(root, async () => {
      await runGit(root, ['remote', 'remove', '--', name])
      this.logger.info('git remote removed', { name, rootPath: root })
      return this.readStatus(root)
    })
  }

  async fetch(root: string, remoteName?: unknown) {
    const name = remoteName === undefined ? null : validateRemoteName(remoteName)
    return this.coordinator.mutate(root, async () => {
      await runGit(root, name ? ['fetch', '--prune', '--', name] : ['fetch', '--prune', '--all'])
      this.logger.info('git fetch finished', { remote: name, rootPath: root })
      return this.readStatus(root)
    })
  }

  async pull(root: string) {
    return this.coordinator.mutate(root, async () => {
      const snapshot = parsePorcelainStatus(
        (await runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])).stdout,
      )
      if (snapshot.conflicts.length) {
        throw new GitOperationError(
          'git_conflicts_present',
          'Cannot pull while conflicts are present',
        )
      }
      if (snapshot.staged.length || snapshot.unstaged.length || snapshot.untracked.length) {
        throw new GitOperationError('git_dirty_worktree', 'Pull requires a clean worktree')
      }
      if (!(await this.upstream(root))) {
        throw new GitOperationError(
          'git_upstream_missing',
          'Cannot pull without an upstream branch',
        )
      }
      await runGit(root, ['pull', '--ff-only'])
      this.logger.info('git pull finished', { rootPath: root })
      return this.readStatus(root)
    })
  }

  async push(root: string, rawOptions: unknown = {}) {
    const options = this.pushOptions(rawOptions)
    return this.coordinator.mutate(root, async () => {
      const branch = await this.value(root, ['symbolic-ref', '--short', '-q', 'HEAD'])
      if (!branch)
        throw new GitOperationError('git_detached_head', 'Cannot push from detached HEAD')
      const upstream = await this.upstream(root)
      if (!upstream && !options.setUpstream) {
        throw new GitOperationError(
          'git_upstream_missing',
          'Current branch has no upstream; setUpstream is required for the first push',
        )
      }
      if (options.setUpstream) {
        const configuredRemote = upstream
          ? await this.value(root, ['config', '--get', `branch.${branch}.remote`])
          : null
        const remote = validateRemoteName(options.remote ?? configuredRemote ?? 'origin')
        await runGit(root, ['push', '--set-upstream', '--', remote, branch])
      } else if (options.remote) {
        await runGit(root, ['push', '--', options.remote, branch])
      } else {
        await runGit(root, ['push'])
      }
      this.logger.info('git push finished', { rootPath: root })
      return this.readStatus(root)
    })
  }

  private async readStatus(root: string): Promise<GitRemoteStatus> {
    const [remoteOutput, branch, head, upstream] = await Promise.all([
      runGit(root, ['remote', '-v']),
      this.value(root, ['symbolic-ref', '--short', '-q', 'HEAD']),
      this.value(root, ['rev-parse', '--verify', 'HEAD']),
      this.upstream(root),
    ])
    const divergence = upstream
      ? await this.value(root, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'])
      : null
    const [ahead = 0, behind = 0] = divergence
      ? divergence.split(/\s+/).map((value) => Number(value) || 0)
      : []
    return {
      remotes: this.parseRemotes(remoteOutput.stdout),
      branch,
      upstream,
      ahead,
      behind,
      detached: branch === null && head !== null,
    }
  }

  private parseRemotes(output: string): GitRemote[] {
    const remotes = new Map<string, GitRemote>()
    for (const line of output.trim().split('\n')) {
      const match = line.match(/^(\S+)\s+(.+)\s+\((fetch|push)\)$/)
      if (!match?.[1] || !match[2] || !match[3]) continue
      const current = remotes.get(match[1]) ?? {
        name: match[1],
        fetch_url: null,
        push_url: null,
      }
      if (match[3] === 'fetch') current.fetch_url = redactGitUrl(match[2])
      else current.push_url = redactGitUrl(match[2])
      remotes.set(match[1], current)
    }
    return [...remotes.values()].sort((left, right) => left.name.localeCompare(right.name))
  }

  private async value(root: string, args: string[]): Promise<string | null> {
    const value = (await runGit(root, args, { allowFailure: true })).stdout.trim()
    return value || null
  }

  private upstream(root: string): Promise<string | null> {
    return this.value(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'])
  }

  private pushOptions(value: unknown): ParsedPushOptions {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new GitOperationError('git_invalid_input', 'Git push options must be an object')
    }
    const options = value as GitPushOptions
    const unknownKey = Object.keys(options).find((key) => key !== 'remote' && key !== 'setUpstream')
    if (unknownKey) {
      throw new GitOperationError('git_invalid_input', `Unknown Git push option: ${unknownKey}`)
    }
    if (options.setUpstream !== undefined && typeof options.setUpstream !== 'boolean') {
      throw new GitOperationError('git_invalid_input', 'setUpstream must be a boolean')
    }
    return {
      setUpstream: options.setUpstream ?? false,
      remote: options.remote === undefined ? null : validateRemoteName(options.remote),
    }
  }
}
