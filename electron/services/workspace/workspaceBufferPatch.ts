import { z } from 'zod'

export const MAX_BUFFER_PATCH_CHANGES = 1_000
export const MAX_BUFFER_PATCH_INSERTED_CHARS = 1_048_576
export const MAX_BUFFER_SNAPSHOT_CHARS = 16_777_216

const textChangeSchema = z
  .object({
    offset: z.number().int().nonnegative(),
    delete_length: z.number().int().nonnegative(),
    insert_text: z.string(),
  })
  .strict()

const patchSchema = z
  .object({
    kind: z.literal('patch'),
    changes: z.array(textChangeSchema).min(1).max(MAX_BUFFER_PATCH_CHANGES),
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
  })

const snapshotSchema = z
  .object({
    kind: z.literal('snapshot'),
    content: z.string().max(MAX_BUFFER_SNAPSHOT_CHARS),
  })
  .strict()

const bufferUpdateSchema = z
  .object({
    path: z.string().min(1).max(4_096),
    base_revision: z.number().int().nonnegative(),
    session_generation: z.number().int().nonnegative(),
    update: z.discriminatedUnion('kind', [patchSchema, snapshotSchema]),
  })
  .strict()

export type WorkspaceBufferTextChange = z.infer<typeof textChangeSchema>
export type WorkspaceBufferUpdate = z.infer<typeof bufferUpdateSchema>
export type WorkspaceBufferUpdateResult =
  | {
      kind: 'applied'
      path: string
      revision: number
      dirty: boolean
      session_generation: number
    }
  | { kind: 'resync_required'; path: string; revision: number; session_generation: number }
  | { kind: 'session_mismatch'; path: string; session_generation: number }

export const parseWorkspaceBufferUpdate = (value: unknown): WorkspaceBufferUpdate =>
  bufferUpdateSchema.parse(value)

export const applyWorkspaceBufferChanges = (
  content: string,
  changes: readonly WorkspaceBufferTextChange[],
): string => {
  const parts: string[] = []
  let cursor = 0
  let previousEnd = 0
  for (const [index, change] of changes.entries()) {
    if (index > 0 && change.offset < previousEnd) {
      throw new Error('Buffer changes overlap or are not sorted')
    }
    const end = change.offset + change.delete_length
    if (change.offset > content.length || end > content.length) {
      throw new Error('Buffer change is outside the current content')
    }
    parts.push(content.slice(cursor, change.offset), change.insert_text)
    cursor = end
    previousEnd = end
  }
  parts.push(content.slice(cursor))
  return parts.join('')
}
