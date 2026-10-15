import fs from 'node:fs/promises'
import path from 'node:path'
import type { GitOpenFileRequest } from '@/types/gitPreview'
import { resolveGitBlob } from '@electron/services/git/blobPreview'
import { runGit } from '@electron/services/git/helpers'
import { validateFilePath, validateWorktreeFile } from '@electron/services/git/pathSafety'
import { resolveCommit } from '@electron/services/git/operationValidation'

export type GitFilePreviewSource =
  | { kind: 'worktree'; root: string; path: string; absolutePath: string; label: string }
  | { kind: 'blob'; root: string; path: string; hash: string; label: string }

export const resolveGitFilePreview = async (
  root: string,
  request: GitOpenFileRequest,
): Promise<GitFilePreviewSource> => {
  const file = validateFilePath(request.path)
  const oldFile = request.oldPath ? validateFilePath(request.oldPath) : file
  if (request.commit) {
    const hash = await resolveCommit(root, request.commit)
    const blob = await resolveGitBlob(root, hash, file)
    if (blob) return { kind: 'blob', root, path: file, hash: blob, label: hash.slice(0, 8) }
    const parent = (await runGit(root, ['rev-list', '--parents', '-n', '1', hash])).stdout
      .trim()
      .split(' ')[1]
    const original = parent ? await resolveGitBlob(root, parent, oldFile) : null
    if (original)
      return { kind: 'blob', root, path: oldFile, hash: original, label: parent!.slice(0, 8) }
  } else {
    if (request.section !== 'staged') {
      await validateWorktreeFile(root, file)
      const absolutePath = path.join(root, file)
      const stat = await fs.lstat(absolutePath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null
        throw error
      })
      if (stat?.isFile())
        return { kind: 'worktree', root, path: file, absolutePath, label: 'Working Tree' }
    }
    const index = await resolveGitBlob(root, null, file)
    if (index) return { kind: 'blob', root, path: file, hash: index, label: 'Index' }
    if (request.section === 'conflicts') {
      const { stdout } = await runGit(root, [
        '--literal-pathspecs',
        'ls-files',
        '--unmerged',
        '-z',
        '--',
        file,
      ])
      const entry = stdout
        .split('\0')
        .map((line) => /^(100644|100755) ([a-f0-9]{40}(?:[a-f0-9]{24})?) ([23])\t/.exec(line))
        .find(Boolean)
      if (entry)
        return {
          kind: 'blob',
          root,
          path: file,
          hash: entry[2]!,
          label: entry[3] === '2' ? 'Ours' : 'Theirs',
        }
    }
    const head = await resolveGitBlob(root, 'HEAD', oldFile)
    if (head) return { kind: 'blob', root, path: oldFile, hash: head, label: 'HEAD' }
  }
  throw new Error('The selected Git file version is no longer available')
}
