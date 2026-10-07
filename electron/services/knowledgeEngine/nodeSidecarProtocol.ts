import type { WorkspaceSidecarClient } from '@electron/services/knowledgeEngine/workspaceSidecarTypes'

export type NodeSidecarMethod = keyof WorkspaceSidecarClient

export type NodeSidecarRequest = {
  id: number
  method: NodeSidecarMethod
  args: unknown[]
}

export type NodeSidecarCancel = { cancelId: number }
export type NodeSidecarMessage = NodeSidecarRequest | NodeSidecarCancel

export type NodeSidecarResponse =
  { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string }

export const isNodeSidecarRequest = (value: unknown): value is NodeSidecarRequest => {
  if (!value || typeof value !== 'object') return false
  const request = value as Partial<NodeSidecarRequest>
  return (
    typeof request.id === 'number' &&
    typeof request.method === 'string' &&
    Array.isArray(request.args) &&
    allowedMethods.has(request.method as NodeSidecarMethod)
  )
}

export const isNodeSidecarCancel = (value: unknown): value is NodeSidecarCancel => {
  if (!value || typeof value !== 'object') return false
  const cancel = value as Partial<NodeSidecarCancel>
  return typeof cancel.cancelId === 'number'
}

export const isNodeSidecarResponse = (value: unknown): value is NodeSidecarResponse => {
  if (!value || typeof value !== 'object') return false
  const response = value as Partial<NodeSidecarResponse>
  return typeof response.id === 'number' && typeof response.ok === 'boolean'
}

const allowedMethods = new Set<NodeSidecarMethod>([
  'applySearchChanges',
  'buildWorkspaceGraph',
  'changeMarkdownDocument',
  'close',
  'closeMarkdownDocument',
  'closeWorkspace',
  'createWorkspaceDirectory',
  'createWorkspaceFile',
  'deleteWorkspacePath',
  'getCapabilities',
  'getMarkdownDocumentSymbols',
  'getMarkdownDiagnostics',
  'getMarkdownLinks',
  'getWorkspaceFileSnapshot',
  'getWorkspacePathMetadata',
  'getWorkspaceStatus',
  'hasDocuments',
  'listWorkspaceEntries',
  'openMarkdownDocument',
  'openWorkspace',
  'readWorkspaceFile',
  'rebuildIndex',
  'removeDocument',
  'removePathPrefix',
  'renameWorkspacePath',
  'resyncMarkdownDocument',
  'search',
  'searchOccurrences',
  'searchWithOptions',
  'shutdown',
  'upsertDocument',
  'writeWorkspaceFile',
])
