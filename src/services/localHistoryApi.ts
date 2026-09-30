import { z } from 'zod'

import { invoke } from '@/runtime/ipc'

export const localHistoryEntrySchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  created_at: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  content_hash: z.string().regex(/^[0-9a-f]{64}$/i),
  source: z.literal('save'),
})

export const localHistorySnapshotSchema = localHistoryEntrySchema.extend({ content: z.string() })

export type LocalHistoryEntry = z.infer<typeof localHistoryEntrySchema>
export type LocalHistorySnapshot = z.infer<typeof localHistorySnapshotSchema>

export const localHistoryApi = {
  async list(path: string): Promise<LocalHistoryEntry[]> {
    const result = await invoke<unknown>('local_history_list', { path })
    return z.array(localHistoryEntrySchema).parse(result)
  },
  async read(path: string, entryId: string): Promise<LocalHistorySnapshot> {
    const result = await invoke<unknown>('local_history_read', { path, entryId })
    return localHistorySnapshotSchema.parse(result)
  },
  async restore(path: string, entryId: string): Promise<LocalHistorySnapshot> {
    const result = await invoke<unknown>('local_history_restore', { path, entryId })
    return localHistorySnapshotSchema.parse(result)
  },
  async delete(path: string, entryId: string): Promise<void> {
    const result = await invoke<unknown>('local_history_delete', { path, entryId })
    z.object({ ok: z.literal(true) }).parse(result)
  },
  async clear(path: string): Promise<number> {
    const result = await invoke<unknown>('local_history_clear', { path })
    return z.object({ deleted: z.number().int().nonnegative() }).parse(result).deleted
  },
}
