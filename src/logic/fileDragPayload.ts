import { z } from 'zod'

export const MARKLAB_FILE_TREE_ITEM_MIME = 'application/x-marklab-file-tree-item'

export type FileTreeDragPayload = {
  kind: 'file'
  path: string
  name: string
}

export const createFileTreeDragPayload = (payload: FileTreeDragPayload) => JSON.stringify(payload)

const fileTreeDragPayloadSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value

    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  },
  z.object({
    kind: z.literal('file'),
    path: z.string().min(1),
    name: z.string().min(1),
  }),
)

export const readFileTreeDragPayload = (dataTransfer: DataTransfer) => {
  const raw = dataTransfer.getData(MARKLAB_FILE_TREE_ITEM_MIME)
  if (!raw) return null

  const payload = fileTreeDragPayloadSchema.safeParse(raw)
  return payload.success ? payload.data : null
}
