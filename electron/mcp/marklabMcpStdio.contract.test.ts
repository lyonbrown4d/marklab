import { PassThrough } from 'node:stream'

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createMarklabMcpServer,
  MARKLAB_SEARCH_WORKSPACE_TOOL,
  MARKLAB_WORKSPACE_STATUS_TOOL,
} from '@electron/mcp/marklabMcpServer.js'
import type { MarklabMcpWorkspaceAdapter } from '@electron/mcp/marklabMcpTypes.js'

type JsonRpcResponse = {
  id: number
  result?: Record<string, unknown>
  error?: { code: number; message: string }
}

const servers: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('marklab MCP stdio contract', () => {
  it('survives protocol errors and continues through initialize, list, and call', async () => {
    const adapter: MarklabMcpWorkspaceAdapter = {
      getWorkspaceStatus: vi.fn(async () => ({
        workspaceRoot: '/workspace',
        engineDataDir: '/engine',
        health: {
          ok: true,
          state: 'ready',
          metadataDocuments: '0',
          searchableDocuments: '0',
          pendingOutboxEvents: '0',
          warnings: [],
        },
        index: {
          searchIndex: 'node-json',
          ready: true,
          metadataDocuments: '0',
          searchableDocuments: '0',
          pendingOutboxEvents: '0',
        },
        storage: {
          metadataStore: 'node-json',
          searchIndex: 'node-json',
          metadataBytes: '0',
          searchIndexBytes: '0',
          totalBytes: '0',
          metadataDocuments: '0',
          pendingOutboxEvents: '0',
          blobStore: false,
          blobBytes: '0',
        },
      })),
      searchWorkspace: vi.fn(async (query, limit) => ({
        query,
        limit,
        totalHits: 0,
        resultCount: 0,
        results: [],
      })),
    }
    const server = createMarklabMcpServer({ adapter, defaultSearchLimit: 10 })
    servers.push(server)
    const stdin = new PassThrough()
    const stdout = new PassThrough()
    const responses = createResponseReader(stdout)
    const protocolError = vi.fn()
    server.server.onerror = protocolError
    await server.connect(new StdioServerTransport(stdin, stdout))

    stdin.write('{not-json}\n')
    await vi.waitFor(() => expect(protocolError).toHaveBeenCalledTimes(1))

    const initialized = await request(stdin, responses, 1, 'initialize', {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'stdio-contract-test', version: '0.0.0' },
    })
    expect(initialized.result?.serverInfo).toMatchObject({ name: 'marklab-mcp' })
    stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`)

    const listed = await request(stdin, responses, 2, 'tools/list')
    expect(listed.result?.tools).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: MARKLAB_WORKSPACE_STATUS_TOOL }),
        expect.objectContaining({ name: MARKLAB_SEARCH_WORKSPACE_TOOL }),
      ]),
    )

    const status = await request(stdin, responses, 3, 'tools/call', {
      name: MARKLAB_WORKSPACE_STATUS_TOOL,
    })
    expect(status.result).toMatchObject({
      isError: false,
      structuredContent: { workspaceRoot: '/workspace', health: { ok: true } },
    })

    const called = await request(stdin, responses, 4, 'tools/call', {
      name: MARKLAB_SEARCH_WORKSPACE_TOOL,
      arguments: { query: 'nothing' },
    })
    expect(called.result).toMatchObject({
      isError: false,
      structuredContent: { query: 'nothing', resultCount: 0 },
    })

    const unknown = await request(stdin, responses, 5, 'marklab/unknown')
    expect(unknown.error?.code).toBe(-32601)
    const ping = await request(stdin, responses, 6, 'ping')
    expect(ping.result).toEqual({})
  })
})

const createResponseReader = (output: PassThrough) => {
  let buffer = ''
  const responses = new Map<number, JsonRpcResponse>()
  const waiters = new Map<number, (response: JsonRpcResponse) => void>()
  output.on('data', (chunk: Buffer) => {
    buffer += chunk.toString('utf8')
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line) continue
      const response = JSON.parse(line) as JsonRpcResponse
      const waiter = waiters.get(response.id)
      if (waiter) {
        waiters.delete(response.id)
        waiter(response)
      } else {
        responses.set(response.id, response)
      }
    }
  })
  return { responses, waiters }
}

const request = async (
  input: PassThrough,
  reader: ReturnType<typeof createResponseReader>,
  id: number,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> => {
  const response = new Promise<JsonRpcResponse>((resolve) => {
    const existing = reader.responses.get(id)
    if (existing) {
      reader.responses.delete(id)
      resolve(existing)
      return
    }
    reader.waiters.set(id, resolve)
  })
  input.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })}\n`)
  return response
}
