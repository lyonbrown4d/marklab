import { createNodeWorkspaceClient } from '@electron/services/knowledgeEngine/nodeWorkspaceClient'
import {
  isNodeSidecarCancel,
  isNodeSidecarRequest,
  type NodeSidecarResponse,
} from '@electron/services/knowledgeEngine/nodeSidecarProtocol'

const workspaceRoot = process.argv[2]
if (!workspaceRoot) throw new Error('Knowledge sidecar workspace root is required.')
const engineDataDir = process.argv[3]
if (!engineDataDir) throw new Error('Knowledge sidecar engine data directory is required.')
if (!process.parentPort) throw new Error('Knowledge sidecar parent port is unavailable.')

const client = createNodeWorkspaceClient(workspaceRoot, engineDataDir)
const activeRequests = new Map<number, AbortController>()

process.parentPort.on('message', (event) => {
  const request = event.data
  if (isNodeSidecarCancel(request)) {
    activeRequests.get(request.cancelId)?.abort()
    return
  }
  if (!isNodeSidecarRequest(request)) return
  const controller = new AbortController()
  activeRequests.set(request.id, controller)
  void dispatch(request.method, request.args, controller.signal)
    .then((result) => send({ id: request.id, ok: true, result }))
    .catch((error: unknown) =>
      send({
        error: error instanceof Error ? error.message : String(error),
        id: request.id,
        ok: false,
      }),
    )
    .finally(() => activeRequests.delete(request.id))
})

const dispatch = async (
  method: keyof typeof client,
  args: unknown[],
  signal: AbortSignal,
): Promise<unknown> => {
  if (method === 'searchOccurrences') {
    return client.searchOccurrences(
      args[0] as Parameters<typeof client.searchOccurrences>[0],
      signal,
    )
  }
  if (method === 'getMarkdownDiagnostics') {
    return client.getMarkdownDiagnostics(args[0] as string, args[1] as string, signal)
  }
  const handler = client[method] as unknown as (...values: unknown[]) => unknown
  return handler.apply(client, args)
}

const send = (response: NodeSidecarResponse): void => {
  process.parentPort?.postMessage(response)
}
