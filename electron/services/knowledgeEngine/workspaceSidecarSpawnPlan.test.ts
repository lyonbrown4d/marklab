import { describe, expect, it } from 'vitest'

import {
  createWorkspaceSidecarSpawnPlan,
  redactWorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'

describe('createWorkspaceSidecarSpawnPlan', () => {
  it('merges process env with workspace sidecar env', () => {
    const plan = createWorkspaceSidecarSpawnPlan({
      binary: binary('engine.exe'),
      identity: identity(),
      processEnv: {
        PATH: 'system-path',
        WORKSPACE_ROOT: 'old-root',
      },
    })

    expect(plan).toMatchObject({
      command: 'engine.exe',
      args: [],
      windowsHide: true,
    })
    expect(plan.env.PATH).toBe('system-path')
    expect(plan.env.WORKSPACE_ROOT).toBe('root-a')
    expect(plan.env.WORKSPACE_INSTANCE_ID).toBe('instance-a')
    expect(plan.env.ENGINE_DATA_DIR).toBe('data-a')
    expect(plan.env.GRPC_SESSION_TOKEN).toBe('token-a')
  })

  it('redacts the session token from diagnostic output', () => {
    const redacted = redactWorkspaceSidecarSpawnPlan(
      createWorkspaceSidecarSpawnPlan({
        binary: binary('engine.exe'),
        identity: identity(),
        processEnv: {},
      }),
    )

    expect(redacted.env.GRPC_SESSION_TOKEN).toBe('<redacted>')
    expect(JSON.stringify(redacted)).not.toContain('token-a')
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
  env: {
    ENGINE_DATA_DIR: 'data-a',
    GRPC_SESSION_TOKEN: 'token-a',
    WORKSPACE_INSTANCE_ID: 'instance-a',
    WORKSPACE_ROOT: 'root-a',
  },
})
