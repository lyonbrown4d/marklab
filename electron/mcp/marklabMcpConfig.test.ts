import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseMarklabMcpRuntimeConfig } from '@electron/mcp/marklabMcpConfig'

describe('parseMarklabMcpRuntimeConfig', () => {
  it('parses required paths and a bounded default search limit', () => {
    const config = parseMarklabMcpRuntimeConfig([
      '--workspace-root',
      './notes',
      '--engine-data-dir=./engine',
      '--default-search-limit',
      '25',
    ])

    expect(config).toEqual({
      defaultSearchLimit: 25,
      engineDataDir: path.resolve('engine'),
      workspaceRoot: path.resolve('notes'),
    })
  })

  it('rejects unknown, missing, and unsafe limit arguments', () => {
    expect(() => parseMarklabMcpRuntimeConfig(['--unknown', 'value'])).toThrow(
      'Unknown marklab-mcp option',
    )
    expect(() => parseMarklabMcpRuntimeConfig(['--workspace-root', './notes'])).toThrow(
      '--engine-data-dir is required',
    )
    expect(() =>
      parseMarklabMcpRuntimeConfig([
        '--workspace-root',
        './notes',
        '--engine-data-dir',
        './engine',
        '--default-search-limit',
        '51',
      ]),
    ).toThrow('--default-search-limit must be an integer from 1 to 50')
  })

  it('uses explicit CLI workspace paths instead of process-wide environment defaults', () => {
    const config = parseMarklabMcpRuntimeConfig(
      ['--workspace-root', './window-a', '--engine-data-dir', './window-a-engine'],
      {
        MARKLAB_MCP_ENGINE_DATA_DIR: './window-b-engine',
        MARKLAB_MCP_WORKSPACE_ROOT: './window-b',
      },
    )

    expect(config.workspaceRoot).toBe(path.resolve('window-a'))
    expect(config.engineDataDir).toBe(path.resolve('window-a-engine'))
  })
})
