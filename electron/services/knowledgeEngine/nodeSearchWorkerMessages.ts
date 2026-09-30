import type { WorkspaceSearchDocument } from '@electron/services/workspace/workspaceSearchTypes.js'

export type NodeSearchWorkerBuildRequest = {
  documents: WorkspaceSearchDocument[]
  workspaceIdentity: string
}

export type NodeSearchWorkerBuildResult = {
  buildDurationMs: number
  documentCount: number
  documents: WorkspaceSearchDocument[]
  indexBytes: number
  serializedIndex: unknown
  workspaceIdentity: string
}

export type NodeSearchWorkerResponse =
  { ok: true; payload: NodeSearchWorkerBuildResult } | { ok: false; error: string }
