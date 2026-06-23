import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { describe, expect, it, vi } from 'vitest'

import {
  WorkspaceSidecarManager,
  type WorkspaceSidecarClient,
} from '@electron/services/knowledgeEngine/workspaceSidecarManager.js'
import type { Logger } from '@electron/services/logger.js'

describe('WorkspaceSidecarManager', () => {
  it('starts a sidecar, opens a workspace over grpc, and tracks runtime state', async () => {
    const { child, client, manager, startSidecar } = createManager()

    await manager.open('workspace-a', 'index-a')

    expect(startSidecar).toHaveBeenCalledTimes(1)
    expect(client.getCapabilities).toHaveBeenCalledTimes(1)
    expect(client.openWorkspace).toHaveBeenCalledWith('index-a')
    expect(manager.listActive()).toMatchObject([
      {
        address: '127.0.0.1:40101',
        workspaceId: 'workspace-a',
        indexPath: 'index-a',
        pid: 1234,
        state: 'ready',
      },
    ])
    expect(child.kill).not.toHaveBeenCalled()
    expect(JSON.stringify(manager.listActive())).not.toContain('sessionToken')
  })

  it('attaches a redacted spawn plan when a knowledge engine binary is available', async () => {
    const { manager } = createManager()

    await manager.open('workspace-a', 'index-a')

    expect(manager.listActive()[0]?.spawnPlan).toMatchObject({
      command: 'engine.exe',
      args: [],
      env: {
        GRPC_SESSION_TOKEN: '<redacted>',
      },
      windowsHide: true,
    })
    expect(JSON.stringify(manager.listActive())).not.toContain('sessionToken')
  })

  it('routes search requests to the workspace grpc client', async () => {
    const { client, manager } = createManager()
    await manager.open('workspace-a', 'index-a')

    await manager.search('workspace-a', 'alpha', 10)

    expect(client.search).toHaveBeenCalledWith('alpha', 10)
  })

  it('does not reopen an already ready workspace with the same index path', async () => {
    const { client, manager, startSidecar } = createManager()

    await manager.open('workspace-a', 'index-a')
    await manager.open('workspace-a', 'index-a')

    expect(startSidecar).toHaveBeenCalledTimes(1)
    expect(client.openWorkspace).toHaveBeenCalledTimes(1)
  })

  it('closes an existing workspace and removes the runtime', async () => {
    const { child, client, manager } = createManager()
    await manager.open('workspace-a', 'index-a')

    await manager.close('workspace-a')

    expect(client.closeWorkspace).toHaveBeenCalledTimes(1)
    expect(client.shutdown).toHaveBeenCalledWith('workspace closed')
    expect(client.close).toHaveBeenCalledTimes(1)
    expect(child.kill).toHaveBeenCalledTimes(1)
    expect(manager.listActive()).toEqual([])
  })

  it('rejects requests for workspaces that are not ready', async () => {
    const { manager } = createManager()

    await expect(manager.search('missing', 'alpha', 10)).rejects.toThrow(
      'Knowledge sidecar workspace is not ready',
    )
  })

  it('rejects open when the binary is not available', async () => {
    const { manager } = createManager({
      resolveBinary: () => ({
        binaryPath: 'missing-engine.exe',
        exists: false,
        source: 'dev-resource',
      }),
    })

    await expect(manager.open('workspace-a', 'index-a')).rejects.toThrow(
      'Knowledge engine binary not found',
    )
  })
})

type CreateManagerOptions = {
  resolveBinary?: ConstructorParameters<typeof WorkspaceSidecarManager>[0]['resolveBinary']
}

const createManager = (options: CreateManagerOptions = {}) => {
  const child = createChild()
  const client = createClient()
  const startSidecar = vi.fn(async () => ({
    address: '127.0.0.1:40101',
    child,
    client,
  }))
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger

  return {
    child,
    client,
    manager: new WorkspaceSidecarManager({
      appDataDir: 'app-data',
      logger,
      resolveBinary:
        options.resolveBinary ??
        (() => ({
          binaryPath: 'engine.exe',
          exists: true,
          source: 'dev-resource',
        })),
      startSidecar,
    }),
    startSidecar,
  }
}

const createClient = (): WorkspaceSidecarClient => ({
  close: vi.fn(),
  closeWorkspace: vi.fn(async () => undefined),
  getCapabilities: vi.fn(async () => ({})),
  hasDocuments: vi.fn(async () => false),
  openWorkspace: vi.fn(async () => undefined),
  rebuildIndex: vi.fn(async () => undefined),
  removeDocument: vi.fn(async () => undefined),
  removePathPrefix: vi.fn(async () => undefined),
  search: vi.fn(async () => []),
  shutdown: vi.fn(async () => undefined),
  upsertDocument: vi.fn(async () => undefined),
})

const createChild = (): ChildProcessWithoutNullStreams => {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const stdin = new PassThrough()
  const child = new EventEmitter() as ChildProcessWithoutNullStreams

  Object.assign(child, {
    kill: vi.fn(() => {
      Object.assign(child, { killed: true })
      child.emit('exit', null, 'SIGTERM')
      return true
    }),
    killed: false,
    pid: 1234,
    stderr,
    stdin,
    stdout,
  })

  return child
}
