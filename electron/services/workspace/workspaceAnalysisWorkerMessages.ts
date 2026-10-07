import type { FsMarkdownDiagnostic, FsWorkspaceIndex } from '@electron/services/workspace/types'
import type { WorkspaceGraphNodeDetailsSelection } from '@electron/services/knowledgeEngine/workspaceGraphNodeDetails'
import type { WorkspaceGraphNodeDetailsWorkerResult } from '@electron/services/workspace/workspaceGraphNodeDetailsCache'

export type { WorkspaceGraphNodeDetailsWorkerResult } from '@electron/services/workspace/workspaceGraphNodeDetailsCache'

export type MarkdownDocument = {
  path: string
  content: string
}

export type WorkspaceKnownPaths = {
  paths: string[]
  assetPaths: string[]
}

export type WorkspaceBuildIndexTask = {
  type: 'workspace-index'
  documents: MarkdownDocument[]
  knownPaths: WorkspaceKnownPaths
}

export type WorkspaceAnalyzeTask = {
  type: 'markdown-diagnostics'
  documents: MarkdownDocument[]
  knownPaths: WorkspaceKnownPaths
  path: string
}

export type WorkspaceGraphNodeDetailsTask = {
  type: 'workspace-graph-node-details'
  documents: MarkdownDocument[]
  query: WorkspaceGraphNodeDetailsSelection
  revision: string
}

export type WorkspaceAnalysisTask =
  WorkspaceBuildIndexTask | WorkspaceAnalyzeTask | WorkspaceGraphNodeDetailsTask

export type WorkspaceBuildIndexResult = FsWorkspaceIndex
export type WorkspaceAnalyzeResult = FsMarkdownDiagnostic[]

export type WorkspaceAnalysisResult =
  WorkspaceAnalyzeResult | WorkspaceBuildIndexResult | WorkspaceGraphNodeDetailsWorkerResult

export type WorkspaceAnalysisWorkerRequest = {
  id: number
  task: WorkspaceAnalysisTask
}

export type WorkspaceAnalysisWorkerResponse =
  | {
      id: number
      ok: true
      payload: WorkspaceAnalysisResult
    }
  | {
      id: number
      ok: false
      error: string
    }
