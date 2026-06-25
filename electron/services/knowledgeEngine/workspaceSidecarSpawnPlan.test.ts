import { describe, expect, it } from 'vitest'

import {
  createWorkspaceSidecarSpawnPlan,
  redactWorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'

describe('createWorkspaceSidecarSpawnPlan', () => {
  it('passes workspace settings and the session token as cli args', () => {
    const plan = createWorkspaceSidecarSpawnPlan({
      binary: binary('engine.exe'),
      identity: identity(),
    })

    expect(plan).toMatchObject({
      command: 'engine.exe',
      args: [
        '--workspace-instance-id',
        'instance-a',
        '--workspace-root',
        'root-a',
        '--engine-data-dir',
        'data-a',
        '--grpc-session-token',
        'token-a',
      ],
      windowsHide: true,
    })
  })

  it('redacts the session token from diagnostic output', () => {
    const redacted = redactWorkspaceSidecarSpawnPlan(
      createWorkspaceSidecarSpawnPlan({
        binary: binary('engine.exe'),
        identity: identity(),
      }),
    )

    expect(redacted.env).toEqual({})
    expect(JSON.stringify(redacted)).not.toContain('token-a')
    expect(redacted.args).toEqual([
      '--workspace-instance-id',
      'instance-a',
      '--workspace-root',
      'root-a',
      '--engine-data-dir',
      'data-a',
      '--grpc-session-token',
      '<redacted>',
    ])
  })
})

const binary = (binaryPath: string): KnowledgeEngineBinaryResolution => ({
  binaryPath,
  exists: true,
  source: 'dev-resource',
})

const identity = (): WorkspaceSidecarIdentity => ({
  workspaceId: 'workspace-a',
  workspaceInstanceId: 'instance-a',
  canonicalRoot: 'root-a',
  engineDataDir: 'data-a',
  sessionToken: 'token-a',
})
