import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes'
import type {
  OccurrenceSearchInput,
  OccurrenceSearchOutput,
} from '@electron/services/knowledgeEngine/workspaceOccurrenceSearch'

export type WorkspaceOccurrenceSearchWorkerRequest = {
  documents: WorkspaceSearchDocument[]
  id: number
  input: OccurrenceSearchInput
}

export type WorkspaceOccurrenceSearchWorkerResponse =
  | { id: number; ok: true; result: OccurrenceSearchOutput }
  | { id: number; ok: false; error: string }
