import MiniSearch, { type AsPlainObject } from 'minisearch'

import {
  createMiniSearch,
  nodeSearchMiniSearchOptions,
} from '@electron/services/knowledgeEngine/nodeSearchConfig.js'
import {
  nodeSearchWorkerRunner,
  type NodeSearchWorkerRunner,
} from '@electron/services/knowledgeEngine/nodeSearchWorkerClient.js'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

const DEFAULT_CHUNK_SIZE = 128
const DEFAULT_WORKER_DOCUMENT_THRESHOLD = 512
const DEFAULT_WORKER_CONTENT_THRESHOLD_BYTES = 4 * 1024 * 1024

export type NodeSearchBuildOptions = {
  abortSignal?: AbortSignal
  chunkSize?: number
  onWorkerFallback?: (error: unknown) => void
  workerContentThresholdBytes?: number
  workerDocumentThreshold?: number
  workerRunner?: NodeSearchWorkerRunner
  workspaceIdentity?: string
  yieldControl?: () => Promise<void>
}

type NodeSearchBuildResult = {
  documents: Map<string, WorkspaceSearchDocument>
  indexBytes?: number
  miniSearch: MiniSearch<WorkspaceSearchDocument>
  serializedIndex?: unknown
}

export const buildNodeSearchIndex = async (
  source: WorkspaceSearchDocument[],
  normalize: (document: WorkspaceSearchDocument) => WorkspaceSearchDocument,
  options: NodeSearchBuildOptions,
  isCurrent: () => boolean,
): Promise<NodeSearchBuildResult | null> => {
  const workerBuilt = await buildWithWorker(source, normalize, options, isCurrent)
  if (workerBuilt !== undefined) return workerBuilt
  return buildInChunks(source, normalize, options, isCurrent)
}

const buildWithWorker = async (
  source: WorkspaceSearchDocument[],
  normalize: (document: WorkspaceSearchDocument) => WorkspaceSearchDocument,
  options: NodeSearchBuildOptions,
  isCurrent: () => boolean,
): Promise<NodeSearchBuildResult | null | undefined> => {
  const runner = options.workerRunner ?? nodeSearchWorkerRunner
  if (!runner.available || !shouldUseWorker(source, options)) return undefined
  const signal = options.abortSignal ?? new AbortController().signal
  if (signal.aborted || !isCurrent()) return null
  try {
    const result = await runner.run(
      { documents: source, workspaceIdentity: options.workspaceIdentity ?? '' },
      signal,
    )
    if (signal.aborted || !isCurrent()) return null
    if (result.workspaceIdentity !== (options.workspaceIdentity ?? '')) {
      throw new Error('Node search worker returned a different workspace identity.')
    }
    const documents = new Map<string, WorkspaceSearchDocument>()
    for (const document of result.documents) {
      const normalized = normalize(document)
      documents.set(normalized.path, normalized)
    }
    if (documents.size !== result.documentCount) {
      throw new Error('Node search worker returned an invalid document count.')
    }
    if (!Number.isSafeInteger(result.indexBytes) || result.indexBytes < 1) {
      throw new Error('Node search worker returned an invalid index size.')
    }
    const miniSearch = MiniSearch.loadJS<WorkspaceSearchDocument>(
      result.serializedIndex as AsPlainObject,
      nodeSearchMiniSearchOptions(),
    )
    if (miniSearch.documentCount !== documents.size) {
      throw new Error('Node search worker returned an invalid MiniSearch index.')
    }
    return {
      documents,
      indexBytes: result.indexBytes,
      miniSearch,
      serializedIndex: result.serializedIndex,
    }
  } catch (error) {
    if (signal.aborted || !isCurrent()) return null
    options.onWorkerFallback?.(error)
    return undefined
  }
}

const buildInChunks = async (
  source: WorkspaceSearchDocument[],
  normalize: (document: WorkspaceSearchDocument) => WorkspaceSearchDocument,
  options: NodeSearchBuildOptions,
  isCurrent: () => boolean,
): Promise<NodeSearchBuildResult | null> => {
  const chunkSize = Math.max(1, Math.trunc(options.chunkSize ?? DEFAULT_CHUNK_SIZE))
  const yieldControl = options.yieldControl ?? yieldToEventLoop
  const documents = new Map<string, WorkspaceSearchDocument>()

  for (let offset = 0; offset < source.length; offset += chunkSize) {
    if (!isCurrent()) return null
    for (const document of source.slice(offset, offset + chunkSize)) {
      const normalized = normalize(document)
      documents.set(normalized.path, normalized)
    }
    if (offset + chunkSize < source.length) await yieldControl()
  }

  const miniSearch = createMiniSearch()
  const normalizedDocuments = [...documents.values()]
  for (let offset = 0; offset < normalizedDocuments.length; offset += chunkSize) {
    if (!isCurrent()) return null
    miniSearch.addAll(normalizedDocuments.slice(offset, offset + chunkSize))
    if (offset + chunkSize < normalizedDocuments.length) await yieldControl()
  }
  return isCurrent() ? { documents, miniSearch } : null
}

const shouldUseWorker = (
  source: WorkspaceSearchDocument[],
  options: NodeSearchBuildOptions,
): boolean => {
  const documentThreshold = Math.max(
    1,
    Math.trunc(options.workerDocumentThreshold ?? DEFAULT_WORKER_DOCUMENT_THRESHOLD),
  )
  if (source.length >= documentThreshold) return true
  const contentThreshold = Math.max(
    1,
    Math.trunc(options.workerContentThresholdBytes ?? DEFAULT_WORKER_CONTENT_THRESHOLD_BYTES),
  )
  let contentBytes = 0
  for (const document of source) {
    contentBytes += Buffer.byteLength(document.content)
    if (contentBytes >= contentThreshold) return true
  }
  return false
}

const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve)
  })
