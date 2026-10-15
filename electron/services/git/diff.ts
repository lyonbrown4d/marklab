import { readGitTextBlob } from '@electron/services/git/blobPreview'
import { readUtf8RepoFile } from '@electron/services/git/helpers'
import { validateFilePath } from '@electron/services/git/pathSafety'
import type { GitFileDiff } from '@electron/services/git/types'

export class GitDiffReader {
  async fileDiff(rootPath: unknown, filePath: unknown, section: unknown): Promise<GitFileDiff> {
    if (typeof rootPath !== 'string') throw new Error('Git repository root is required')
    const root = rootPath
    const safePath = validateFilePath(filePath)
    const diffSection = typeof section === 'string' ? section : 'unstaged'
    const labelsAndContent = await this.readSection(root, safePath, diffSection)
    return { path: safePath, old_path: null, ...labelsAndContent }
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
        readGitTextBlob(root, 'HEAD', filePath),
        readGitTextBlob(root, null, filePath),
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
        readGitTextBlob(root, 'HEAD', filePath),
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
      readGitTextBlob(root, null, filePath),
      readUtf8RepoFile(root, filePath),
    ])
    const originalContent = indexContent ?? (await readGitTextBlob(root, 'HEAD', filePath)) ?? ''
    return {
      original_label: 'Index',
      modified_label: 'Working Tree',
      original_content: originalContent,
      modified_content: worktreeContent,
    }
  }
}
