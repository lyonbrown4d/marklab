import { parentPort } from 'node:worker_threads'

import { searchWorkspaceOccurrences } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'
import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import type {
  WorkspaceOccurrenceSearchWorkerRequest,
  WorkspaceOccurrenceSearchWorkerResponse,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearchWorkerMessages'

let documents: WorkspaceSearchDocument[] = []
let revision = ''

parentPort?.on('message', (request: WorkspaceOccurrenceSearchWorkerRequest) => {
  let response: WorkspaceOccurrenceSearchWorkerResponse
  try {
    if (request.type === 'sync') {
      documents = request.documents
      revision = request.revision
      response = { type: 'synced', id: request.id, ok: true, revision }
    } else if (request.revision !== revision) {
      throw new Error('Occurrence search worker document revision is stale.')
    } else {
      response = {
        type: 'result',
        id: request.id,
        ok: true,
        revision,
        result: searchWorkspaceOccurrences(documents, request.input),
      }
    }
  } catch (error) {
    response = {
      type: 'error',
      error: error instanceof Error ? error.message : 'Workspace occurrence search failed.',
      id: request.id,
      ok: false,
    }
  }
  parentPort?.postMessage(response)
})
