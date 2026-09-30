import { parentPort } from 'node:worker_threads'

import { createMiniSearch } from '@electron/services/knowledgeEngine/nodeSearchConfig.js'
import { normalizeSearchDocument } from '@electron/services/knowledgeEngine/nodeSearchIndexSupport.js'
import type {
  NodeSearchWorkerBuildRequest,
  NodeSearchWorkerResponse,
} from '@electron/services/knowledgeEngine/nodeSearchWorkerMessages.js'

parentPort?.once('message', (request: NodeSearchWorkerBuildRequest) => {
  const response = buildResponse(request)
  parentPort?.postMessage(response)
})

const buildResponse = (request: NodeSearchWorkerBuildRequest): NodeSearchWorkerResponse => {
  const startedAt = performance.now()
  try {
    const byPath = new Map(
      request.documents.map(normalizeSearchDocument).map((document) => [document.path, document]),
    )
    const documents = [...byPath.values()]
    const miniSearch = createMiniSearch()
    miniSearch.addAll(documents)
    const serializedIndex = miniSearch.toJSON()
    return {
      ok: true,
      payload: {
        buildDurationMs: performance.now() - startedAt,
        documentCount: documents.length,
        documents,
        indexBytes: Buffer.byteLength(JSON.stringify(serializedIndex)),
        serializedIndex,
        workspaceIdentity: request.workspaceIdentity,
      },
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Node search worker failed.',
    }
  }
}
