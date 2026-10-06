import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'

const DEFAULT_CHUNK_SIZE = 128

export type NodeSearchBuildOptions = {
  abortSignal?: AbortSignal
  chunkSize?: number
  yieldControl?: () => Promise<void>
}

export const buildNodeSearchDocuments = async (
  source: WorkspaceSearchDocument[],
  normalize: (document: WorkspaceSearchDocument) => WorkspaceSearchDocument,
  options: NodeSearchBuildOptions,
  isCurrent: () => boolean,
): Promise<WorkspaceSearchDocument[] | null> => {
  const chunkSize = Math.max(1, Math.trunc(options.chunkSize ?? DEFAULT_CHUNK_SIZE))
  const yieldControl = options.yieldControl ?? yieldToEventLoop
  const documents = new Map<string, WorkspaceSearchDocument>()
  for (let offset = 0; offset < source.length; offset += chunkSize) {
    if (options.abortSignal?.aborted || !isCurrent()) return null
    for (const document of source.slice(offset, offset + chunkSize)) {
      const normalized = normalize(document)
      documents.set(normalized.path, normalized)
    }
    if (offset + chunkSize < source.length) await yieldControl()
  }
  return options.abortSignal?.aborted || !isCurrent() ? null : [...documents.values()]
}

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve)
  })
