import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { WorkspaceSidecarManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager'
import { createNodeWorkspaceClient } from '@electron/services/knowledgeEngine/nodeWorkspaceClient'
import { createManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager.testFixture'
import type { Logger } from '@electron/services/logger'

describe('WorkspaceSidecarManager', () => {
  it('opens a workspace with the built-in Node runtime and no binary resolver', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-node-manager-'))
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as Logger
    const manager = new WorkspaceSidecarManager({
      appDataDir: workspaceRoot,
      logger,
      startSidecar: async (_plan, identity) => ({
        address: 'node:utility-process',
        client: createNodeWorkspaceClient(identity.canonicalRoot),
      }),
    })

    try {
      await manager.open('workspace-node', workspaceRoot, { openWorkspace: false })
      await manager.createWorkspaceFile('workspace-node', 'local.md')

      expect(manager.listActive()).toMatchObject([
        {
          address: 'node:utility-process',
          spawnPlan: { command: 'node:utility-process' },
          state: 'ready',
          workspaceId: 'workspace-node',
        },
      ])
      await expect(manager.listWorkspaceEntries('workspace-node')).resolves.toMatchObject([
        { kind: 'file', path: 'local.md' },
      ])
    } finally {
      manager.clear()
      await fs.rm(workspaceRoot, { force: true, recursive: true })
    }
  })

  it('starts an isolated runtime, opens a workspace, and tracks runtime state', async () => {
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

  it('marks a ready runtime as failed when its utility process exits unexpectedly', async () => {
    const { child, manager } = createManager()
    await manager.open('workspace-a', 'index-a')

    child.emit('exit', 7)

    expect(manager.listActive()).toMatchObject([
      {
        lastError: 'Knowledge utility process exited with code 7.',
        state: 'error',
        workspaceId: 'workspace-a',
      },
    ])
    await expect(manager.search('workspace-a', 'alpha', 10)).rejects.toThrow(
      'Knowledge sidecar workspace is not ready',
    )
  })

  it('reports the Node runtime plan without exposing workspace secrets', async () => {
    const { manager } = createManager()

    await manager.open('workspace-a', 'index-a')

    expect(manager.listActive()[0]).toMatchObject({
      spawnPlan: {
        command: 'node:utility-process',
        args: [],
        env: {},
        windowsHide: true,
      },
    })
    expect(JSON.stringify(manager.listActive())).not.toContain('sessionToken')
  })

  it('routes search requests to the workspace client', async () => {
    const { client, manager } = createManager()
    await manager.open('workspace-a', 'index-a')

    await manager.search('workspace-a', 'alpha', 10)

    expect(client.search).toHaveBeenCalledWith('alpha', 10)
  })

  it('routes search requests with options to the workspace client', async () => {
    const { client, manager } = createManager()
    await manager.open('workspace-a', 'index-a')

    const result = await manager.searchWithOptions('workspace-a', 'alpha', {
      limit: 5,
      includeTotalHits: true,
    })

    expect(client.searchWithOptions).toHaveBeenCalledWith('alpha', {
      limit: 5,
      includeTotalHits: true,
    })
    expect(result).toEqual({
      diagnostics: undefined,
      results: [
        {
          column: 1,
          end_column: 7,
          line: 3,
          path: 'alpha.md',
          score: 0.75,
          snippet: 'Alpha body',
          snippet_highlights: [{ end: 5, start: 0 }],
          title: 'Alpha',
        },
      ],
      totalHits: 1,
    })
  })

  it('routes document index requests to the workspace grpc client', async () => {
    const { client, manager } = createManager()
    const documents = [{ content: '# Alpha', path: 'alpha.md', title: 'Alpha' }]
    await manager.open('workspace-a', 'index-a')

    await expect(manager.hasDocuments('workspace-a')).resolves.toBe(false)
    await manager.rebuildIndex('workspace-a', documents)

    expect(client.hasDocuments).toHaveBeenCalledTimes(1)
    expect(client.rebuildIndex).toHaveBeenCalledWith(documents)
  })

  it('routes a mixed search mutation batch in one client request', async () => {
    const { client, manager } = createManager()
    const batch = {
      removeDocuments: ['old.md'],
      removePrefixes: ['archive'],
      upserts: [{ content: 'Fresh', path: 'fresh.md', title: 'Fresh' }],
    }
    await manager.open('workspace-a', 'index-a')

    await manager.applySearchChanges('workspace-a', batch)

    expect(client.applySearchChanges).toHaveBeenCalledWith(batch)
  })

  it('reopens a workspace after its utility process enters the error state', async () => {
    const { child, manager, startSidecar } = createManager()
    await manager.open('workspace-a', 'index-a')
    child.emit('exit', 7)

    await manager.open('workspace-a', 'index-a')

    expect(startSidecar).toHaveBeenCalledTimes(2)
    expect(manager.listActive()[0]).toMatchObject({ state: 'ready', workspaceId: 'workspace-a' })
  })

  it('routes workspace vfs write requests to the workspace grpc client', async () => {
    const { client, manager } = createManager()
    await manager.open('workspace-a', 'index-a')

    await expect(manager.writeWorkspaceFile('workspace-a', 'alpha.md', '# Alpha')).resolves.toEqual(
      {
        changed: true,
        kind: 'file',
      },
    )

    expect(client.writeWorkspaceFile).toHaveBeenCalledWith('alpha.md', '# Alpha')
  })
  it('routes markdown overlay requests with the workspace instance id', async () => {
    const { client, manager } = createManager()
    await manager.open('workspace-a', 'index-a')

    await manager.openMarkdownDocument('workspace-a', {
      content: '# Alpha',
      documentId: 'alpha.md',
      uri: 'file:///workspace/alpha.md',
      version: 1,
    })
    await manager.changeMarkdownDocument('workspace-a', {
      baseVersion: 1,
      changes: [],
      documentId: 'alpha.md',
      version: 2,
    })
    await manager.getMarkdownDocumentSymbols('workspace-a', 'alpha.md', 2)

    const workspaceInstanceId = manager.listActive()[0]?.identity.workspaceInstanceId
    expect(client.openMarkdownDocument).toHaveBeenCalledWith(workspaceInstanceId, {
      content: '# Alpha',
      documentId: 'alpha.md',
      uri: 'file:///workspace/alpha.md',
      version: 1,
    })
    expect(client.changeMarkdownDocument).toHaveBeenCalledWith(workspaceInstanceId, {
      baseVersion: 1,
      changes: [],
      documentId: 'alpha.md',
      version: 2,
    })
    expect(client.getMarkdownDocumentSymbols).toHaveBeenCalledWith('alpha.md', 2)
  })

  it('routes stateless Markdown diagnostics to the workspace client', async () => {
    const { client, manager } = createManager()
    await manager.open('workspace-a', 'index-a')

    await manager.getMarkdownDiagnostics('workspace-a', 'alpha.md', '[A][missing]')

    expect(client.getMarkdownDiagnostics).toHaveBeenCalledWith('alpha.md', '[A][missing]')
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

  it('still shuts down and closes local resources when closeWorkspace fails', async () => {
    const { child, client, manager } = createManager()
    vi.mocked(client.closeWorkspace).mockRejectedValueOnce(new Error('close failed'))
    await manager.open('workspace-a', 'index-a')

    await manager.close('workspace-a')

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
})
