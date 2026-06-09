import { invoke } from '@/runtime/ipc'
import { z } from 'zod'
import type { GitDiffSection } from '@/store/appTypes'

export const gitRepoInfoSchema = z.object({
  is_repository: z.boolean(),
  workdir: z.string().nullable().optional(),
  git_dir: z.string().nullable().optional(),
  branch: z.string().nullable().optional(),
  head: z.string().nullable().optional(),
})

export const gitFileChangeSchema = z.object({
  path: z.string(),
  old_path: z.string().nullable().optional(),
  status: z.enum([
    'added',
    'modified',
    'deleted',
    'renamed',
    'copied',
    'conflicted',
    'untracked',
    'ignored',
    'tracked',
    'pruned',
  ]),
  detail: z.string(),
})

export const gitStatusSnapshotSchema = z.object({
  repo: gitRepoInfoSchema,
  staged: z.array(gitFileChangeSchema),
  unstaged: z.array(gitFileChangeSchema),
  untracked: z.array(gitFileChangeSchema),
  conflicts: z.array(gitFileChangeSchema),
})

export const gitFileDiffSchema = z.object({
  path: z.string(),
  old_path: z.string().nullable().optional(),
  original_label: z.string(),
  modified_label: z.string(),
  original_content: z.string(),
  modified_content: z.string(),
  unified_diff: z.string().optional(),
})

export type GitRepoInfo = z.infer<typeof gitRepoInfoSchema>
export type GitFileChange = z.infer<typeof gitFileChangeSchema>
export type GitStatusSnapshot = z.infer<typeof gitStatusSnapshotSchema>
export type GitFileDiff = z.infer<typeof gitFileDiffSchema>

export type GitDiffRequest = {
  path: string
  status?: GitFileChange['status']
  section: GitDiffSection
}

export const gitApi = {
  async discoverRepo(rootPath: string) {
    const result = await invoke<unknown>('git_discover_repo', { rootPath })
    return gitRepoInfoSchema.parse(result)
  },
  async initRepo(rootPath: string) {
    const result = await invoke<unknown>('git_init_repo', { rootPath })
    return gitRepoInfoSchema.parse(result)
  },
  async getStatus(rootPath: string) {
    const result = await invoke<unknown>('git_get_status', { rootPath })
    return gitStatusSnapshotSchema.parse(result)
  },
  async getFileDiff(rootPath: string, path: string, section: GitDiffRequest['section']) {
    const result = await invoke<unknown>('git_get_file_diff', { rootPath, path, section })
    return gitFileDiffSchema.parse(result)
  },
  async commitAll(rootPath: string, message: string) {
    const result = await invoke<unknown>('git_commit_all', { rootPath, message })
    return gitStatusSnapshotSchema.parse(result)
  },
}
