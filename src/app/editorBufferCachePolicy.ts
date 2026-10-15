import type { SaveState } from '@/app/useEditorBufferState'

// Text estimates avoid encoding/copying documents merely to decide retention.
export const estimateEditorTextBytes = (content: string) => content.length * 2
export const EDITOR_BUFFER_CACHE_LIMITS = {
  maxDocuments: 6,
  maxTextBytes: 16 * 1024 * 1024,
} as const
export type EditorBufferCacheEntry = {
  workspace: string
  path: string
  content: string
  lastActive: number
  dirty?: boolean
  loading?: boolean
  saveState?: SaveState
  pending?: boolean
}

export const getEditorBufferEvictions = (
  entries: EditorBufferCacheEntry[],
  workspace: string,
  activePath: string | null,
  openPaths: readonly string[] | undefined,
) => {
  const protectedEntry = (entry: EditorBufferCacheEntry) =>
    (entry.workspace === workspace && entry.path === activePath) ||
    entry.dirty ||
    entry.loading ||
    entry.pending ||
    (entry.saveState && entry.saveState.status !== 'saved')
  const evicted = new Set<EditorBufferCacheEntry>()
  for (const entry of entries) {
    if (protectedEntry(entry)) continue
    if (entry.workspace !== workspace || (openPaths && !openPaths.includes(entry.path))) {
      evicted.add(entry)
    }
  }
  const retained = entries.filter((entry) => !evicted.has(entry))
  let bytes = retained.reduce((sum, entry) => sum + estimateEditorTextBytes(entry.content), 0)
  let count = retained.length
  for (const entry of retained.sort((left, right) => left.lastActive - right.lastActive)) {
    if (
      count <= EDITOR_BUFFER_CACHE_LIMITS.maxDocuments &&
      bytes <= EDITOR_BUFFER_CACHE_LIMITS.maxTextBytes
    )
      break
    if (protectedEntry(entry)) continue
    evicted.add(entry)
    count -= 1
    bytes -= estimateEditorTextBytes(entry.content)
  }
  return [...evicted]
}
