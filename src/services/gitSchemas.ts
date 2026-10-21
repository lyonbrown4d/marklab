import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'
import type { GitDiffSection } from '@/store/appTypes'
import { gitPreviewUnavailableReasonSchema } from '@/types/gitPreview'

export const gitRepoInfoSchema = z.object({
  is_repository: z.boolean(),
  workdir: z.string().nullable(),
  git_dir: z.string().nullable(),
  branch: z.string().nullable(),
  head: z.string().nullable(),
}) satisfies z.ZodType<GitRepoInfo>

export const gitFileChangeSchema = z.object({
  path: z.string(),
  old_path: z.string().nullable(),
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
}) satisfies z.ZodType<GitFileChange>

export const gitStatusSnapshotSchema = z.object({
  repo: gitRepoInfoSchema,
  staged: z.array(gitFileChangeSchema),
  unstaged: z.array(gitFileChangeSchema),
  untracked: z.array(gitFileChangeSchema),
  conflicts: z.array(gitFileChangeSchema),
}) satisfies z.ZodType<GitStatusSnapshot>

export const gitFileDiffSchema = z.object({
  path: z.string(),
  old_path: z.string().nullable(),
  original_label: z.string(),
  modified_label: z.string(),
  original_content: z.string(),
  modified_content: z.string(),
  unavailable_reason: gitPreviewUnavailableReasonSchema.optional(),
}) satisfies z.ZodType<GitFileDiff>

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
}) satisfies z.ZodType<GitRemoteStatus>

export type GitRepoInfo = DesktopCommandResults['git_discover']

export type GitFileChange = GitStatusSnapshot['staged'][number]

export type GitStatusSnapshot = DesktopCommandResults['git_status']

export type GitFileDiff = DesktopCommandResults['git_file_diff']

export type GitRemoteStatus = DesktopCommandResults['git_remote_status']

// A diff tab carries display context beyond the native request.
export type GitDiffRequest = Pick<DesktopCommandArgs['git_file_diff']['request'], 'path'> & {
  section: GitDiffSection
  status?: GitFileChange['status']
}
