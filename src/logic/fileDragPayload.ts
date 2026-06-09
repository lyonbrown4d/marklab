export const MARKLAB_FILE_TREE_ITEM_MIME = 'application/x-marklab-file-tree-item'

export type FileTreeDragPayload = {
  kind: 'file'
  path: string
  name: string
}

export const createFileTreeDragPayload = (payload: FileTreeDragPayload) => JSON.stringify(payload)

export const readFileTreeDragPayload = (dataTransfer: DataTransfer) => {
  const raw = dataTransfer.getData(MARKLAB_FILE_TREE_ITEM_MIME)
  if (!raw) return null

  try {
    const payload = JSON.parse(raw) as Partial<FileTreeDragPayload>
    if (payload.kind !== 'file') return null
    if (typeof payload.path !== 'string' || !payload.path) return null
    if (typeof payload.name !== 'string' || !payload.name) return null
    return {
      kind: 'file',
      path: payload.path,
      name: payload.name,
    } satisfies FileTreeDragPayload
  } catch {
    return null
  }
}
