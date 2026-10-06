import {
  normalizeRepoRelativePath,
  readUtf8RepoFile,
  runGit,
  syntheticUnifiedDiff,
} from '@electron/services/git/helpers'
import type { GitFileDiff } from '@electron/services/git/types'

export class GitDiffReader {
  async fileDiff(rootPath: unknown, filePath: unknown, section: unknown): Promise<GitFileDiff> {
    if (typeof rootPath !== 'string') throw new Error('Git repository root is required')
    const root = rootPath
    const safePath = normalizeRepoRelativePath(filePath)
    const headContent = await this.readGitBlob(root, `HEAD:${safePath}`)
    const indexContent = await this.readGitBlob(root, `:${safePath}`)
    const worktreeContent = await readUtf8RepoFile(root, safePath)

    const diffSection = typeof section === 'string' ? section : 'unstaged'
    const labelsAndContent = (() => {
      if (diffSection === 'staged') {
        return {
          original_label: 'HEAD',
          modified_label: 'Index',
          original_content: headContent ?? '',
          modified_content: indexContent ?? '',
        }
      }
      if (diffSection === 'untracked') {
        return {
          original_label: 'Empty',
          modified_label: 'Working Tree',
          original_content: '',
          modified_content: worktreeContent,
        }
      }
      if (diffSection === 'conflicts') {
        return {
          original_label: 'HEAD',
          modified_label: 'Working Tree',
          original_content: headContent ?? '',
          modified_content: worktreeContent,
        }
      }
      return {
        original_label: 'Index',
        modified_label: 'Working Tree',
        original_content: indexContent ?? headContent ?? '',
        modified_content: worktreeContent,
      }
    })()

    const unifiedDiff = await this.unifiedDiff(
      root,
      safePath,
      diffSection,
      labelsAndContent.original_content,
      labelsAndContent.modified_content,
    )
    return { path: safePath, old_path: null, ...labelsAndContent, unified_diff: unifiedDiff }
  }

  private async readGitBlob(root: string, spec: string): Promise<string | null> {
    const result = await runGit(root, ['show', '--no-ext-diff', '--no-textconv', spec], {
      allowFailure: true,
    })
    if (result.stderr || !result.stdout) return null
    return result.stdout
  }

  private async unifiedDiff(
    root: string,
    filePath: string,
    section: string,
    originalContent: string,
    modifiedContent: string,
  ): Promise<string> {
    if (section === 'untracked') {
      return syntheticUnifiedDiff(filePath, originalContent, modifiedContent)
    }
    const args = ['diff', '--no-ext-diff', '--no-textconv']
    if (section === 'staged') args.push('--cached')
    args.push('--', filePath)
    const result = await runGit(root, args, { allowFailure: true })
    return result.stdout || syntheticUnifiedDiff(filePath, originalContent, modifiedContent)
  }
}
