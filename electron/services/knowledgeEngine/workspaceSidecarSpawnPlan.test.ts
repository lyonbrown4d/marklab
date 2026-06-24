import { describe, expect, it } from 'vitest'

import {
  createWorkspaceSidecarSpawnPlan,
  redactWorkspaceSidecarSpawnPlan,
} from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type { KnowledgeEngineBinaryResolution } from '@electron/services/knowledgeEngine/types.js'
import type { WorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'

describe('createWorkspaceSidecarSpawnPlan', () => {
  it('passes workspace settings as args and the session token as env', () => {
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
      args: [
        '--workspace-instance-id',
        'instance-a',
        '--workspace-root',
        'root-a',
        '--engine-data-dir',
        'data-a',
      ],
      windowsHide: true,
    })
    expect(plan.env.PATH).toBe('system-path')
    expect(plan.env.WORKSPACE_ROOT).toBe('old-root')
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
    expect(redacted.args).toEqual([
      '--workspace-instance-id',
      'instance-a',
      '--workspace-root',
      'root-a',
      '--engine-data-dir',
      'data-a',
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
