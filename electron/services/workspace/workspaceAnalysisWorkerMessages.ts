import type {
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

export type WorkspaceAnalysisTask =
  | WorkspaceBuildIndexTask
  | WorkspaceSearchTask
  | WorkspaceAnalyzeTask

export type WorkspaceBuildIndexResult = FsWorkspaceIndex
export type WorkspaceSearchResult = FsSearchResult[]
export type WorkspaceAnalyzeResult = FsMarkdownDiagnostic[]

export type WorkspaceAnalysisResult =
  | WorkspaceAnalyzeResult
  | WorkspaceBuildIndexResult
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
