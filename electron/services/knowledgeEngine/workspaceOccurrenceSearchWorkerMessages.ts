import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import type {
  OccurrenceSearchInput,
  OccurrenceSearchOutput,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'

export type WorkspaceOccurrenceSearchWorkerRequest = {
  id: number
} & (
  | {
      type: 'sync'
      documents: WorkspaceSearchDocument[]
      revision: string
    }
  | {
      type: 'search'
      input: OccurrenceSearchInput
      revision: string
    }
)

export type WorkspaceOccurrenceSearchWorkerResponse =
  | { type: 'synced'; id: number; ok: true; revision: string }
  | { type: 'result'; id: number; ok: true; revision: string; result: OccurrenceSearchOutput }
  | { type: 'error'; id: number; ok: false; error: string }
