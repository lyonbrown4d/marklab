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
})

export const gitRemoteStatusSchema = z.object({
  remotes: z.array(
    z.object({
      name: z.string(),
      fetch_url: z.string().nullable(),
      push_url: z.string().nullable(),
    }),
  ),
  branch: z.string().nullable(),
  upstream: z.string().nullable(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  detached: z.boolean(),
})

export type GitRepoInfo = z.infer<typeof gitRepoInfoSchema>
export type GitFileChange = z.infer<typeof gitFileChangeSchema>
export type GitStatusSnapshot = z.infer<typeof gitStatusSnapshotSchema>
export type GitFileDiff = z.infer<typeof gitFileDiffSchema>
export type GitRemoteStatus = z.infer<typeof gitRemoteStatusSchema>

export type GitDiffRequest = {
  path: string
  status?: GitFileChange['status']
  section: GitDiffSection
}
