import { parentPort } from 'node:worker_threads'

import { diagnosticsForFile } from '@electron/services/workspace/markdown/diagnostics'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown'
import type {
  WorkspaceAnalysisResult,
  WorkspaceAnalysisTask,
  WorkspaceAnalysisWorkerRequest,
} from '@electron/services/workspace/workspaceAnalysisWorkerMessages'
import { WorkspaceGraphNodeDetailsCache } from '@electron/services/workspace/workspaceGraphNodeDetailsCache'

const graphNodeDetails = new WorkspaceGraphNodeDetailsCache()

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

const runWorkspaceTask = (task: WorkspaceAnalysisTask): WorkspaceAnalysisResult => {
  switch (task.type) {
    case 'workspace-index':
      return runWorkspaceBuildIndex(task)
    case 'markdown-diagnostics':
      return runWorkspaceAnalyze(task)
    case 'workspace-graph-node-details':
      return graphNodeDetails.query(task.revision, task.documents, task.query)
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
