import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type {
  MarklabMcpSearchResultSet,
  MarklabMcpWorkspaceAdapter,
  MarklabMcpWorkspaceStatus,
} from '@electron/mcp/marklabMcpTypes.js'

export const MARKLAB_WORKSPACE_STATUS_TOOL = 'marklab_workspace_status'
export const MARKLAB_SEARCH_WORKSPACE_TOOL = 'marklab_search_workspace'

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const

const statusSchema = z.object({
  workspaceRoot: z.string(),
  engineDataDir: z.string(),
  health: z.object({
    ok: z.boolean(),
    state: z.string(),
    metadataDocuments: z.string(),
    searchableDocuments: z.string(),
    pendingOutboxEvents: z.string(),
    warnings: z.array(z.string()),
  }),
  index: z.object({
    searchIndex: z.string(),
    ready: z.boolean(),
    metadataDocuments: z.string(),
    searchableDocuments: z.string(),
    pendingOutboxEvents: z.string(),
  }),
  storage: z.object({
    metadataStore: z.string(),
    searchIndex: z.string(),
    metadataBytes: z.string(),
    searchIndexBytes: z.string(),
    totalBytes: z.string(),
    metadataDocuments: z.string(),
    pendingOutboxEvents: z.string(),
    blobStore: z.boolean(),
    blobBytes: z.string(),
  }),
})

const searchResultSchema = z.object({
  documentId: z.string(),
  path: z.string(),
  title: z.string(),
  line: z.number(),
  column: z.number(),
  endColumn: z.number(),
  snippet: z.string(),
  snippetHighlights: z.array(z.object({ start: z.number(), end: z.number() })),
  score: z.number(),
})

const searchResultSetSchema = z.object({
  query: z.string(),
  limit: z.number(),
  totalHits: z.number(),
  resultCount: z.number(),
  results: z.array(searchResultSchema),
})

type CreateMarklabMcpServerOptions = {
  adapter: MarklabMcpWorkspaceAdapter
  defaultSearchLimit: number
}

export const createMarklabMcpServer = ({
  adapter,
  defaultSearchLimit,
}: CreateMarklabMcpServerOptions): McpServer => {
  const server = new McpServer(
    { name: 'marklab-mcp', title: 'MarkLab MCP Sidecar', version: '0.2.0' },
    {
      instructions:
        'Read-only MarkLab workspace context. Tools expose indexed status and search results; they never write files or execute commands.',
    },
  )

  server.registerTool(
    MARKLAB_WORKSPACE_STATUS_TOOL,
    {
      title: 'MarkLab workspace status',
      description: 'Return health, index, and storage status for the configured workspace index.',
      outputSchema: statusSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async () => toolCall(() => adapter.getWorkspaceStatus()),
  )

  server.registerTool(
    MARKLAB_SEARCH_WORKSPACE_TOOL,
    {
      title: 'Search MarkLab workspace',
      description: 'Search the configured workspace index and return bounded Markdown matches.',
      inputSchema: {
        query: z.string().trim().min(1, 'query is required'),
        limit: z.number().int().min(1).max(50).optional(),
      },
      outputSchema: searchResultSetSchema,
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ query, limit }) =>
      toolCall(() => adapter.searchWorkspace(query, limit ?? defaultSearchLimit)),
  )

  return server
}

const toolCall = async <T extends MarklabMcpWorkspaceStatus | MarklabMcpSearchResultSet>(
  operation: () => Promise<T>,
) => {
  try {
    const structuredContent = await operation()
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(structuredContent, null, 2) }],
      structuredContent: structuredContent as unknown as Record<string, unknown>,
      isError: false,
    }
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: formatError(error) }],
      isError: true,
    }
  }
}

const formatError = (error: unknown): string =>
  error instanceof Error ? error.message : 'MarkLab MCP tool failed.'
