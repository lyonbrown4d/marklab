import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('marklab MCP build configuration', () => {
  it('builds the MCP stdio entry and documents direct invocation', async () => {
    const root = process.cwd()
    const vite = await fs.readFile(path.join(root, 'vite.config.ts'), 'utf8')
    const architecture = await fs.readFile(
      path.join(root, 'docs/architecture/node-knowledge-sidecar.md'),
      'utf8',
    )

    expect(vite).toContain('marklabMcpEntry')
    expect(architecture).toContain('dist-electron/marklabMcpEntry.js')
    expect(architecture).toContain('ELECTRON_RUN_AS_NODE')
  })
})
