import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { createWorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'

describe('createWorkspaceSidecarIdentity', () => {
  it('creates stable workspace ids and sidecar environment values', () => {
    const first = createWorkspaceSidecarIdentity({
      appDataDir: 'app-data',
      workspaceId: 'workspace-a',
      indexPath: 'relative/index',
      sessionToken: 'token-a',
    })
    const second = createWorkspaceSidecarIdentity({
      appDataDir: 'app-data',
      workspaceId: 'workspace-a',
      indexPath: 'relative/index',
      sessionToken: 'token-b',
    })

    expect(first.workspaceInstanceId).toBe(second.workspaceInstanceId)
    expect(first.sessionToken).toBe('token-a')
    expect(first.canonicalRoot).toBe(path.resolve('relative/index'))
    expect(first.engineDataDir).toBe(path.join('app-data', 'workspaces', first.workspaceInstanceId))
  })

  it('uses different ids for different workspace keys', () => {
    const first = createWorkspaceSidecarIdentity({
      appDataDir: 'app-data',
      workspaceId: 'workspace-a',
      indexPath: 'index',
      sessionToken: 'token',
    })
    const second = createWorkspaceSidecarIdentity({
      appDataDir: 'app-data',
      workspaceId: 'workspace-b',
      indexPath: 'index',
      sessionToken: 'token',
    })

    expect(first.workspaceInstanceId).not.toBe(second.workspaceInstanceId)
  })
})
