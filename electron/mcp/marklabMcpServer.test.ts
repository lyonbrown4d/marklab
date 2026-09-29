import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  createMarklabMcpServer,
  MARKLAB_SEARCH_WORKSPACE_TOOL,
  MARKLAB_WORKSPACE_STATUS_TOOL,
} from '@electron/mcp/marklabMcpServer.js'
import type { MarklabMcpWorkspaceAdapter } from '@electron/mcp/marklabMcpTypes.js'

const openConnections: Array<{ client: Client; closeServer: () => Promise<void> }> = []

const status = {
  workspaceRoot: '/workspace',
  engineDataDir: '/engine',
  health: {
    ok: true,
    state: 'ready',
    metadataDocuments: '1',
    searchableDocuments: '1',
    pendingOutboxEvents: '0',
    warnings: [],
  },
  index: {
    searchIndex: 'node-json',
    ready: true,
    metadataDocuments: '1',
    searchableDocuments: '1',
    pendingOutboxEvents: '0',
  },
  storage: {
    metadataStore: 'node-json',
    searchIndex: 'node-json',
    metadataBytes: '0',
    searchIndexBytes: '128',
    totalBytes: '128',
    metadataDocuments: '1',
    pendingOutboxEvents: '0',
    blobStore: false,
    blobBytes: '0',
  },
}

const createAdapter = (): MarklabMcpWorkspaceAdapter => ({
  getWorkspaceStatus: vi.fn(async () => status),
  searchWorkspace: vi.fn(async (query, limit) => ({
    limit,
    query,
    resultCount: 1,
    totalHits: 1,
    results: [
      {
        column: 1,
        documentId: 'notes/project.md',
        endColumn: 6,
        line: 1,
        path: 'notes/project.md',
        score: 2,
        snippet: 'alpha context',
        snippetHighlights: [{ end: 5, start: 0 }],
        title: 'Project',
      },
    ],
  })),
})

const connect = async (adapter = createAdapter(), defaultSearchLimit = 10) => {
  const server = createMarklabMcpServer({ adapter, defaultSearchLimit })
  const client = new Client({ name: 'marklab-mcp-test', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  openConnections.push({ client, closeServer: () => server.close() })
  return { adapter, client }
}

afterEach(async () => {
  await Promise.all(
    openConnections.splice(0).map(async ({ client, closeServer }) => {
      await client.close()
      await closeServer()
    }),
  )
})

describe('marklab MCP server', () => {
  it('initializes, responds to ping, and lists only read-only tools', async () => {
    const { client } = await connect()

    await expect(client.ping()).resolves.toBeDefined()
    expect(client.getServerVersion()?.name).toBe('marklab-mcp')
    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name)).toEqual([
      MARKLAB_WORKSPACE_STATUS_TOOL,
      MARKLAB_SEARCH_WORKSPACE_TOOL,
    ])
    for (const tool of listed.tools) {
      expect(tool.annotations).toMatchObject({
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      })
    }
  })

  it('calls status and search with structured and text content', async () => {
    const { adapter, client } = await connect(createAdapter(), 7)

    const statusResult = await client.callTool({ name: MARKLAB_WORKSPACE_STATUS_TOOL })
    const searchResult = await client.callTool({
      name: MARKLAB_SEARCH_WORKSPACE_TOOL,
      arguments: { query: 'alpha' },
    })

    expect(statusResult).toMatchObject({ isError: false, structuredContent: status })
    expect(JSON.stringify(statusResult.content)).toContain('"type":"text"')
    expect(searchResult).toMatchObject({
      isError: false,
      structuredContent: { limit: 7, query: 'alpha', resultCount: 1 },
    })
    expect(adapter.searchWorkspace).toHaveBeenCalledWith('alpha', 7)
  })

  it('returns tool errors for missing query and out-of-range limits', async () => {
    const { client } = await connect()

    const missingQuery = await client.callTool({
      name: MARKLAB_SEARCH_WORKSPACE_TOOL,
      arguments: {},
    })
    const invalidLimit = await client.callTool({
      name: MARKLAB_SEARCH_WORKSPACE_TOOL,
      arguments: { query: 'alpha', limit: 51 },
    })

    expect(missingQuery.isError).toBe(true)
    expect(invalidLimit.isError).toBe(true)
    expect(JSON.stringify(missingQuery.content)).toContain('query')
    expect(JSON.stringify(invalidLimit.content)).toContain('50')
  })

  it('returns an explicit successful empty search result', async () => {
    const adapter = createAdapter()
    vi.mocked(adapter.searchWorkspace).mockResolvedValue({
      limit: 10,
      query: 'missing',
      resultCount: 0,
      totalHits: 0,
      results: [],
    })
    const { client } = await connect(adapter)

    const result = await client.callTool({
      name: MARKLAB_SEARCH_WORKSPACE_TOOL,
      arguments: { query: 'missing' },
    })

    expect(result).toMatchObject({
      isError: false,
      structuredContent: { query: 'missing', resultCount: 0, totalHits: 0, results: [] },
    })
  })
})
