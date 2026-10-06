import { createNodeWorkspaceClient } from '@electron/services/knowledgeEngine/nodeWorkspaceClient'
import {
  isNodeSidecarRequest,
  type NodeSidecarResponse,
} from '@electron/services/knowledgeEngine/nodeSidecarProtocol'

const workspaceRoot = process.argv[2]
if (!workspaceRoot) throw new Error('Knowledge sidecar workspace root is required.')
const engineDataDir = process.argv[3]
if (!engineDataDir) throw new Error('Knowledge sidecar engine data directory is required.')
if (!process.parentPort) throw new Error('Knowledge sidecar parent port is unavailable.')

const client = createNodeWorkspaceClient(workspaceRoot, engineDataDir)

process.parentPort.on('message', (event) => {
  const request = event.data
  if (!isNodeSidecarRequest(request)) return
  void dispatch(request.method, request.args)
    .then((result) => send({ id: request.id, ok: true, result }))
    .catch((error: unknown) =>
      send({
        error: error instanceof Error ? error.message : String(error),
        id: request.id,
        ok: false,
      }),
    )
})

const dispatch = async (method: keyof typeof client, args: unknown[]): Promise<unknown> => {
  const handler = client[method] as unknown as (...values: unknown[]) => unknown
  return handler.apply(client, args)
}

const send = (response: NodeSidecarResponse): void => {
  process.parentPort?.postMessage(response)
}
