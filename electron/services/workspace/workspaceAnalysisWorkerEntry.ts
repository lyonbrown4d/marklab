import { parentPort } from 'node:worker_threads'

import {
  buildOutlineGraph,
  buildWorkspaceGraph,
} from '@electron/services/workspace/markdown/graph.js'
import { diagnosticsForFile } from '@electron/services/workspace/markdown/diagnostics.js'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import { searchDocuments } from '@electron/services/workspace/markdown/search.js'
import type {
  WorkspaceAnalysisResult,
  WorkspaceAnalysisTask,
  WorkspaceAnalysisWorkerRequest,
} from '@electron/services/workspace/workspaceAnalysisWorkerMessages.js'

const runWorkspaceBuildIndex = ({
  documents,
  knownPaths,
}: {
  documents: { path: string; content: string }[]
  knownPaths: { paths: string[]; assetPaths: string[] }
}): WorkspaceAnalysisResult => {
  const files = documents.map((document) => parseMarkdownDocument(document.path, document.content))
  return {
    files,
    paths: knownPaths.paths,
    asset_paths: knownPaths.assetPaths,
  }
}

const runWorkspaceSearch = ({
  documents,
  query,
  limit,
}: {
  documents: { path: string; content: string }[]
  query: string
  limit: number
}): WorkspaceAnalysisResult => {
  return searchDocuments(documents, query, limit)
}

const runWorkspaceAnalyze = ({
  documents,
  knownPaths,
  path,
}: {
  documents: { path: string; content: string }[]
  knownPaths: { paths: string[]; assetPaths: string[] }
  path: string
}): WorkspaceAnalysisResult => {
  const index = {
    files: documents.map((document) => parseMarkdownDocument(document.path, document.content)),
    paths: knownPaths.paths,
    asset_paths: knownPaths.assetPaths,
  }
  return diagnosticsForFile(index, path)
}

const runWorkspaceGraph = ({
  documents,
  knownPaths,
}: {
  documents: { path: string; content: string }[]
  knownPaths: { paths: string[]; assetPaths: string[] }
}): WorkspaceAnalysisResult => {
  const index = {
    files: documents.map((document) => parseMarkdownDocument(document.path, document.content)),
    paths: knownPaths.paths,
    asset_paths: knownPaths.assetPaths,
  }
  return buildWorkspaceGraph(index)
}

const runWorkspaceOutlineGraph = ({
  path,
  content,
}: {
  path: string
  content: string
}): WorkspaceAnalysisResult => {
  return buildOutlineGraph(path, content)
}

const runWorkspaceTask = (task: WorkspaceAnalysisTask): WorkspaceAnalysisResult => {
  switch (task.type) {
    case 'workspace-index':
      return runWorkspaceBuildIndex(task)
    case 'search-documents':
      return runWorkspaceSearch(task)
    case 'markdown-diagnostics':
      return runWorkspaceAnalyze(task)
    case 'workspace-graph':
      return runWorkspaceGraph(task)
    case 'outline-graph':
      return runWorkspaceOutlineGraph(task)
  }
}

parentPort?.on('message', (request: WorkspaceAnalysisWorkerRequest) => {
  try {
    const result = runWorkspaceTask(request.task)
    parentPort?.postMessage({
      id: request.id,
      ok: true,
      payload: result,
    })
  } catch (error) {
    parentPort?.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : 'Workspace analysis worker failed.',
    })
  }
})
