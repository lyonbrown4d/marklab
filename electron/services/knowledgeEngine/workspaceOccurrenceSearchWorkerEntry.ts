import { parentPort } from 'node:worker_threads'

import { searchWorkspaceOccurrences } from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'
import type {
  WorkspaceOccurrenceSearchWorkerRequest,
  WorkspaceOccurrenceSearchWorkerResponse,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearchWorkerMessages'

parentPort?.once('message', (request: WorkspaceOccurrenceSearchWorkerRequest) => {
  let response: WorkspaceOccurrenceSearchWorkerResponse
  try {
    response = {
      id: request.id,
      ok: true,
      result: searchWorkspaceOccurrences(request.documents, request.input),
    }
  } catch (error) {
    response = {
      error: error instanceof Error ? error.message : 'Workspace occurrence search failed.',
      id: request.id,
      ok: false,
    }
  }
  parentPort?.postMessage(response)
})
