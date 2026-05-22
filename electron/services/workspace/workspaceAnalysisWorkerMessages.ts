import type {
  FsGraph,
  FsMarkdownDiagnostic,
  FsSearchResult,
  FsWorkspaceIndex,
} from '@electron/services/workspace/types.js'

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

export type WorkspaceSearchTask = {
  type: 'search-documents'
  documents: MarkdownDocument[]
  query: string
  limit: number
}

export type WorkspaceAnalyzeTask = {
  type: 'markdown-diagnostics'
  documents: MarkdownDocument[]
  knownPaths: WorkspaceKnownPaths
  path: string
}

export type WorkspaceGraphTask = {
  type: 'workspace-graph'
  documents: MarkdownDocument[]
  knownPaths: WorkspaceKnownPaths
}

export type WorkspaceOutlineGraphTask = {
  type: 'outline-graph'
  path: string
  content: string
}

export type WorkspaceAnalysisTask =
  | WorkspaceBuildIndexTask
  | WorkspaceSearchTask
  | WorkspaceAnalyzeTask
  | WorkspaceGraphTask
  | WorkspaceOutlineGraphTask

export type WorkspaceBuildIndexResult = FsWorkspaceIndex
export type WorkspaceSearchResult = FsSearchResult[]
export type WorkspaceAnalyzeResult = FsMarkdownDiagnostic[]
export type WorkspaceGraphResult = FsGraph

export type WorkspaceAnalysisResult =
  | WorkspaceAnalyzeResult
  | WorkspaceBuildIndexResult
  | WorkspaceGraphResult
  | WorkspaceSearchResult

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
