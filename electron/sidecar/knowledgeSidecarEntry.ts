import { createNodeWorkspaceClient } from '@electron/services/knowledgeEngine/nodeWorkspaceClient'
import {
  isNodeSidecarCancel,
  isNodeSidecarRequest,
  type NodeSidecarRequest,
  type NodeSidecarResponse,
  type NodeSidecarWorkspace,
} from '@electron/services/knowledgeEngine/nodeSidecarProtocol'

if (!process.parentPort) throw new Error('Knowledge sidecar parent port is unavailable.')

const clients = new Map<string, ReturnType<typeof createNodeWorkspaceClient>>()
const workspaces = new Map<string, NodeSidecarWorkspace>()
const activeRequests = new Map<string, AbortController>()

process.parentPort.on('message', (event) => {
  const request = event.data
  if (isNodeSidecarCancel(request)) {
    activeRequests.get(requestKey(request.workspaceInstanceId, request.cancelId))?.abort()
    return
  }
  if (!isNodeSidecarRequest(request)) return
  const controller = new AbortController()
  const key = requestKey(request.workspace.workspaceInstanceId, request.id)
  activeRequests.set(key, controller)
  void dispatch(request, controller.signal)
    .then((result) =>
      send({
        id: request.id,
        ok: true,
        result,
        workspaceInstanceId: request.workspace.workspaceInstanceId,
      }),
    )
    .catch((error: unknown) =>
      send({
        error: error instanceof Error ? error.message : String(error),
        id: request.id,
        ok: false,
        workspaceInstanceId: request.workspace.workspaceInstanceId,
      }),
    )
    .finally(() => activeRequests.delete(key))
})

const dispatch = async (request: NodeSidecarRequest, signal: AbortSignal): Promise<unknown> => {
  const client = workspaceClient(request.workspace)
  if (request.method === 'searchOccurrences') {
    return client.searchOccurrences(
      request.args[0] as Parameters<typeof client.searchOccurrences>[0],
      signal,
    )
  }
  if (request.method === 'getMarkdownDiagnostics') {
    return client.getMarkdownDiagnostics(
      request.args[0] as string,
      request.args[1] as string,
      signal,
    )
  }
  const handler = client[request.method] as unknown as (...values: unknown[]) => unknown
  try {
    return await handler.apply(client, request.args)
  } finally {
    if (request.method === 'shutdown') {
      clients.delete(request.workspace.workspaceInstanceId)
      workspaces.delete(request.workspace.workspaceInstanceId)
    }
  }
}

const workspaceClient = (workspace: NodeSidecarWorkspace) => {
  const current = workspaces.get(workspace.workspaceInstanceId)
  if (current) {
    if (
      current.canonicalRoot !== workspace.canonicalRoot ||
      current.engineDataDir !== workspace.engineDataDir
    ) {
      throw new Error('Knowledge sidecar workspace identity changed unexpectedly.')
    }
    return clients.get(workspace.workspaceInstanceId)!
  }
  const client = createNodeWorkspaceClient(workspace.canonicalRoot, workspace.engineDataDir)
  workspaces.set(workspace.workspaceInstanceId, workspace)
  clients.set(workspace.workspaceInstanceId, client)
  return client
}

const requestKey = (workspaceInstanceId: string, requestId: number): string =>
  `${workspaceInstanceId}:${requestId}`

const send = (response: NodeSidecarResponse): void => {
  process.parentPort?.postMessage(response)
}
