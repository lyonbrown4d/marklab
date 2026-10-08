import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import {
  NodeSidecarRpcClient,
  type NodeSidecarProcessPort,
} from '@electron/services/knowledgeEngine/nodeSidecarRpcClient'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity'

describe('NodeSidecarRpcClient cancellation', () => {
  it('detaches process listeners when a workspace client closes', () => {
    const port = new FakeProcessPort()
    const client = new NodeSidecarRpcClient(port, identity())

    expect(port.listenerCount('message')).toBe(1)
    expect(port.listenerCount('exit')).toBe(1)

    client.close()

    expect(port.listenerCount('message')).toBe(0)
    expect(port.listenerCount('exit')).toBe(0)
  })

  it('drops the cancelled response and keeps subsequent diagnostics requests usable', async () => {
    const port = new FakeProcessPort()
    const client = new NodeSidecarRpcClient(port, identity())
    const controller = new AbortController()
    const stale = client.getMarkdownDiagnostics('note.md', '[Stale][missing]', controller.signal)
    const staleRequest = port.postMessage.mock.calls[0]?.[0]

    controller.abort()
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    expect(port.postMessage).toHaveBeenCalledWith({
      cancelId: staleRequest.id,
      workspaceInstanceId: 'instance-a',
    })
    respond(port, staleRequest, [{ line: 99 }])

    const current = client.getMarkdownDiagnostics('note.md', '[Current][missing]')
    const currentRequest = port.postMessage.mock.calls[2]?.[0]
    respond(port, currentRequest, [{ line: 1 }])

    await expect(current).resolves.toEqual([{ line: 1 }])
    expect(staleRequest.args).toEqual(['note.md', '[Stale][missing]'])
  })

  it('propagates occurrence-search cancellation to the utility process', async () => {
    const port = new FakeProcessPort()
    const client = new NodeSidecarRpcClient(port, identity())
    const controller = new AbortController()
    const operation = client.searchOccurrences(
      {
        requestId: 'request-1',
        query: 'needle',
        options: { caseSensitive: false, wholeWord: false, useRegex: false },
      },
      controller.signal,
    )
    const request = port.postMessage.mock.calls[0]?.[0]

    controller.abort()

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(port.postMessage).toHaveBeenLastCalledWith({
      cancelId: request.id,
      workspaceInstanceId: 'instance-a',
    })
  })
})

class FakeProcessPort extends EventEmitter implements NodeSidecarProcessPort {
  postMessage = vi.fn()
}

const identity = (): WorkspaceSidecarIdentity => ({
  canonicalRoot: 'workspace-root',
  engineDataDir: 'engine-data',
  sessionToken: 'unused',
  workspaceId: 'workspace-a',
  workspaceInstanceId: 'instance-a',
})

const respond = (port: FakeProcessPort, request: { id: number }, result: unknown): void => {
  port.emit('message', {
    id: request.id,
    ok: true,
    result,
    workspaceInstanceId: 'instance-a',
  })
}
