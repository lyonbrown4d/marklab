import type { DesktopCommandArgs, DesktopCommandResults } from '@/generated/desktop/bindings'
import { z } from 'zod'

export const MAX_BUFFER_PATCH_CHANGES = 1_000
export const MAX_BUFFER_PATCH_INSERTED_CHARS = 1_048_576
export const MAX_BUFFER_SNAPSHOT_CHARS = 16_777_216

export const fsBufferStatusSchema = z
  .object({
    path: z.string(),
    revision: z.number().int().nonnegative(),
    dirty: z.boolean(),
    session_generation: z.number().int().nonnegative(),
  })
  .strict() satisfies z.ZodType<FsBufferStatus>

export const fsBufferTextChangeSchema = z
  .object({
    offset: z.number().int().nonnegative(),
    delete_length: z.number().int().nonnegative(),
    insert_text: z.string(),
  })
  .strict() satisfies z.ZodType<FsBufferTextChange>

export const fsBufferSyncStatusSchema = fsBufferStatusSchema satisfies z.ZodType<FsBufferSyncStatus>

const fsBufferPatchSchema = z
  .object({
    kind: z.literal('patch'),
    changes: z.array(fsBufferTextChangeSchema).min(1).max(MAX_BUFFER_PATCH_CHANGES),
  })
  .strict()
  .superRefine(({ changes }, context) => {
    let insertedChars = 0
    let previousEnd = 0
    changes.forEach((change, index) => {
      insertedChars += change.insert_text.length
      if (index > 0 && change.offset < previousEnd) {
        context.addIssue({
          code: 'custom',
          message: 'Buffer changes must be sorted and non-overlapping',
          path: ['changes', index, 'offset'],
        })
      }
      previousEnd = change.offset + change.delete_length
    })
    if (insertedChars > MAX_BUFFER_PATCH_INSERTED_CHARS) {
      context.addIssue({
        code: 'custom',
        message: 'Buffer patch inserted text exceeds the allowed size',
        path: ['changes'],
      })
    }
  }) satisfies z.ZodType<Extract<FsBufferUpdateRequest['update'], { kind: 'patch' }>>

export const fsBufferUpdateRequestSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    base_revision: z.number().int().nonnegative(),
    session_generation: z.number().int().nonnegative(),
    update: z.discriminatedUnion('kind', [
      fsBufferPatchSchema,
      z
        .object({ kind: z.literal('snapshot'), content: z.string().max(MAX_BUFFER_SNAPSHOT_CHARS) })
        .strict(),
    ]),
  })
  .strict() satisfies z.ZodType<FsBufferUpdateRequest>

export const fsBufferUpdateResultSchema = z.discriminatedUnion('kind', [
  fsBufferSyncStatusSchema.extend({ kind: z.literal('applied') }).strict(),
  z
    .object({
      kind: z.literal('resync_required'),
      path: z.string(),
      revision: z.number().int().nonnegative(),
      session_generation: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('session_mismatch'),
      path: z.string(),
      session_generation: z.number().int().nonnegative(),
    })
    .strict(),
]) satisfies z.ZodType<FsBufferUpdateResult>

export type FsBufferStatus = NonNullable<DesktopCommandResults['fs_get_buffer_status']>

export type FsBufferSyncStatus = NonNullable<DesktopCommandResults['fs_get_buffer_status']>

export type FsBufferTextChange = Extract<
  FsBufferUpdateRequest['update'],
  { kind: 'patch' }
>['changes'][number]

export type FsBufferUpdateRequest = DesktopCommandArgs['fs_apply_buffer_update']['request']

export type FsBufferUpdateResult = DesktopCommandResults['fs_apply_buffer_update']

export const fsBufferSnapshotSchema = fsBufferSyncStatusSchema
  .extend({ content: z.string() })
  .strict() satisfies z.ZodType<FsBufferSnapshot>

export type FsBufferSnapshot = DesktopCommandResults['fs_open_buffer_snapshot']
