import { describe, expect, it } from 'vitest'

import {
  createMcpSidecarSpawnPlan,
  redactMcpSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/mcpSidecarSpawnPlan.js'
import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'

describe('createMcpSidecarSpawnPlan', () => {
  it('passes the workspace root and engine data directory as cli args', () => {
    const plan = createMcpSidecarSpawnPlan({
      binary: binary('marklab-mcp.exe'),
      identity: {
        canonicalRoot: 'root-a',
        engineDataDir: 'data-a',
      },
    })

    expect(plan).toEqual({
      command: 'marklab-mcp.exe',
      args: ['--workspace-root', 'root-a', '--engine-data-dir', 'data-a'],
      windowsHide: true,
    })
  })

  it('passes an optional bounded default search limit', () => {
    const plan = createMcpSidecarSpawnPlan({
      binary: binary('marklab-mcp.exe'),
      defaultSearchLimit: 25,
      identity: {
        canonicalRoot: 'root-a',
        engineDataDir: 'data-a',
      },
    })

    expect(plan.args).toEqual([
      '--workspace-root',
      'root-a',
      '--engine-data-dir',
      'data-a',
      '--default-search-limit',
      '25',
    ])
  })

  it('does not add hidden environment or token state to diagnostics', () => {
    const redacted = redactMcpSidecarSpawnPlan(
      createMcpSidecarSpawnPlan({
        binary: binary('marklab-mcp.exe'),
        identity: {
          canonicalRoot: 'root-a',
          engineDataDir: 'data-a',
        },
      }),
    )

    expect(redacted.env).toEqual({})
    expect(redacted.args).toEqual(['--workspace-root', 'root-a', '--engine-data-dir', 'data-a'])
  })
})

const binary = (binaryPath: string): KnowledgeEngineBinaryResolution => ({
  binaryPath,
  exists: true,
  source: 'dev-resource',
})
