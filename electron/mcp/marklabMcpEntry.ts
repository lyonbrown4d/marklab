import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { parseMarklabMcpRuntimeConfig } from '@electron/mcp/marklabMcpConfig'
import { createMarklabMcpServer } from '@electron/mcp/marklabMcpServer'
import { NodeMcpWorkspaceAdapter } from '@electron/mcp/nodeMcpWorkspaceAdapter'

const main = async (): Promise<void> => {
  const config = parseMarklabMcpRuntimeConfig(process.argv.slice(2))
  const adapter = await NodeMcpWorkspaceAdapter.open(config)
  const server = createMarklabMcpServer({
    adapter,
    defaultSearchLimit: config.defaultSearchLimit,
  })
  await server.connect(new StdioServerTransport())
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `marklab-mcp failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  )
  process.exitCode = 1
})
