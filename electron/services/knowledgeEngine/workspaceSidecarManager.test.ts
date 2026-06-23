import { describe, expect, it, vi } from 'vitest'

import {
  WorkspaceSidecarManager,
  type WorkspaceSidecarTransport,
} from '@electron/services/knowledgeEngine/workspaceSidecarManager.js'
import type { Logger } from '@electron/services/logger.js'

describe('WorkspaceSidecarManager', () => {
  it('opens a workspace through the transport and tracks runtime state', async () => {
    const { manager, transport } = createManager()

    await manager.open('workspace-a', 'index-a')

    expect(transport.initialize).toHaveBeenCalledTimes(1)
    expect(transport.request).toHaveBeenCalledWith('workspace/open', {
      workspaceId: 'workspace-a',
      indexPath: 'index-a',
    })
    expect(manager.listActive()).toMatchObject([
      {
        workspaceId: 'workspace-a',
        indexPath: 'index-a',
        state: 'ready',
      },
    ])
  })

  it('routes workspace requests with the workspace id attached', async () => {
    const { manager, transport } = createManager()
    await manager.open('workspace-a', 'index-a')

    await manager.request('workspace-a', 'workspace/search', { query: 'alpha', limit: 10 })

    expect(transport.request).toHaveBeenLastCalledWith('workspace/search', {
      workspaceId: 'workspace-a',
      query: 'alpha',
      limit: 10,
    })
  })

  it('does not reopen an already ready workspace with the same index path', async () => {
    const { manager, transport } = createManager()

    await manager.open('workspace-a', 'index-a')
    await manager.open('workspace-a', 'index-a')

    expect(transport.initialize).toHaveBeenCalledTimes(1)
    expect(transport.request).toHaveBeenCalledTimes(1)
  })

  it('closes an existing workspace and removes the runtime', async () => {
    const { manager, transport } = createManager()
    await manager.open('workspace-a', 'index-a')

    await manager.close('workspace-a')

    expect(transport.request).toHaveBeenLastCalledWith('workspace/close', {
      workspaceId: 'workspace-a',
    })
    expect(manager.listActive()).toEqual([])
  })

  it('rejects requests for workspaces that are not ready', async () => {
    const { manager } = createManager()

    await expect(manager.request('missing', 'workspace/search')).rejects.toThrow(
      'Knowledge sidecar workspace is not ready',
    )
  })
})

const createManager = () => {
  const transport: WorkspaceSidecarTransport = {
    getStatus: vi.fn(() => ({ state: 'ready', binaryPath: 'engine' }) as const),
    initialize: vi.fn(async () => ({ ok: true })),
    request: vi.fn(async () => ({})),
  }
  const logger = {
    warn: vi.fn(),
  } as unknown as Logger

  return {
    manager: new WorkspaceSidecarManager({ logger, transport }),
    transport,
  }
}
