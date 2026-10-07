import { normalizeRepoRelativePath, readUtf8RepoFile, runGit } from '@electron/services/git/helpers'
import type { GitFileDiff } from '@electron/services/git/types'

export class GitDiffReader {
  async fileDiff(rootPath: unknown, filePath: unknown, section: unknown): Promise<GitFileDiff> {
    if (typeof rootPath !== 'string') throw new Error('Git repository root is required')
    const root = rootPath
    const safePath = normalizeRepoRelativePath(filePath)
    const diffSection = typeof section === 'string' ? section : 'unstaged'
    const labelsAndContent = await this.readSection(root, safePath, diffSection)
    return { path: safePath, old_path: null, ...labelsAndContent }
  }

  private async readGitBlob(root: string, spec: string): Promise<string | null> {
    const result = await runGit(root, ['show', '--no-ext-diff', '--no-textconv', spec], {
      allowFailure: true,
    })
    if (result.stderr || !result.stdout) return null
    return result.stdout
  }

  private async readSection(
    root: string,
    filePath: string,
    section: string,
  ): Promise<Omit<GitFileDiff, 'old_path' | 'path'>> {
    if (section === 'untracked') {
      return {
        original_label: 'Empty',
        modified_label: 'Working Tree',
        original_content: '',
        modified_content: await readUtf8RepoFile(root, filePath),
      }
    }
    if (section === 'staged') {
      const [headContent, indexContent] = await Promise.all([
        this.readGitBlob(root, `HEAD:${filePath}`),
        this.readGitBlob(root, `:${filePath}`),
      ])
      return {
        original_label: 'HEAD',
        modified_label: 'Index',
        original_content: headContent ?? '',
        modified_content: indexContent ?? '',
      }
    }
    if (section === 'conflicts') {
      const [headContent, worktreeContent] = await Promise.all([
        this.readGitBlob(root, `HEAD:${filePath}`),
        readUtf8RepoFile(root, filePath),
      ])
      return {
        original_label: 'HEAD',
        modified_label: 'Working Tree',
        original_content: headContent ?? '',
        modified_content: worktreeContent,
      }
    }

    const [indexContent, worktreeContent] = await Promise.all([
      this.readGitBlob(root, `:${filePath}`),
      readUtf8RepoFile(root, filePath),
    ])
    const originalContent = indexContent ?? (await this.readGitBlob(root, `HEAD:${filePath}`)) ?? ''
    return {
      original_label: 'Index',
      modified_label: 'Working Tree',
      original_content: originalContent,
      modified_content: worktreeContent,
    }
  }
}
