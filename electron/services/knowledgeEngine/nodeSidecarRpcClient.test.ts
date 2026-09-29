import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import {
  NodeSidecarRpcClient,
  type NodeSidecarProcessPort,
} from '@electron/services/knowledgeEngine/nodeSidecarRpcClient.js'

describe('NodeSidecarRpcClient cancellation', () => {
  it('drops the cancelled response and keeps subsequent diagnostics requests usable', async () => {
    const port = new FakeProcessPort()
    const client = new NodeSidecarRpcClient(port)
    const controller = new AbortController()
    const stale = client.getMarkdownDiagnostics('note.md', '[Stale][missing]', controller.signal)
    const staleRequest = port.postMessage.mock.calls[0]?.[0]

    controller.abort()
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' })
    port.emit('message', { id: staleRequest.id, ok: true, result: [{ line: 99 }] })

    const current = client.getMarkdownDiagnostics('note.md', '[Current][missing]')
    const currentRequest = port.postMessage.mock.calls[1]?.[0]
    port.emit('message', { id: currentRequest.id, ok: true, result: [{ line: 1 }] })

    await expect(current).resolves.toEqual([{ line: 1 }])
    expect(staleRequest.args).toEqual(['note.md', '[Stale][missing]'])
  })
})

class FakeProcessPort extends EventEmitter implements NodeSidecarProcessPort {
  postMessage = vi.fn()
}
