import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import type { App } from 'electron'
import { afterEach, describe, expect, it } from 'vitest'

import { resolveKnowledgeEngineBinary } from '@electron/services/knowledgeEngine/binaryPath.js'
import { startGrpcSidecar } from '@electron/services/knowledgeEngine/workspaceSidecarStarter.js'
import type { StartedWorkspaceSidecar } from '@electron/services/knowledgeEngine/workspaceSidecarManager.js'
import { createWorkspaceSidecarIdentity } from '@electron/services/knowledgeEngine/workspaceIdentity.js'
import { createWorkspaceSidecarSpawnPlan } from '@electron/services/knowledgeEngine/workspaceSidecarSpawnPlan.js'
import type { Logger } from '@electron/services/logger.js'

const runIntegration = process.env.MARKLAB_RUN_KNOWLEDGE_INTEGRATION === '1'
const describeIntegration = runIntegration ? describe : describe.skip

let tempRoot: string | null = null
let startedSidecar: StartedWorkspaceSidecar | null = null

describeIntegration('knowledge engine sidecar integration', () => {
  afterEach(async () => {
    if (startedSidecar) {
      await startedSidecar.client.shutdown('integration test complete').catch(() => undefined)
      startedSidecar.client.close()
      if (startedSidecar.child && !startedSidecar.child.killed) {
        startedSidecar.child.kill()
      }
      startedSidecar = null
    }

    if (tempRoot) {
      await rm(tempRoot, { force: true, recursive: true })
      tempRoot = null
    }
  })

  it('starts the binary and serves workspace search plus markdown overlay over grpc', async () => {
    const sidecarLogs: string[] = []
    tempRoot = await mkdtemp(path.join(tmpdir(), 'marklab-knowledge-integration-'))
    const appDataDir = path.join(tempRoot, 'app-data')
    const indexPath = path.join(tempRoot, 'workspace-index')
    await mkdir(appDataDir, { recursive: true })

    const binary = resolveKnowledgeEngineBinary({ isPackaged: false } as App)
    if (!binary?.exists) {
      throw new Error('Knowledge engine binary is missing. Run pnpm knowledge:build first.')
    }

    const identity = createWorkspaceSidecarIdentity({
      appDataDir,
      indexPath,
      sessionToken: 'integration-session-token',
      workspaceId: 'integration-workspace',
    })
    const spawnPlan = createWorkspaceSidecarSpawnPlan({ binary, identity })
    try {
      startedSidecar = await startGrpcSidecar(spawnPlan, identity, createLogger(sidecarLogs))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${message}\nsidecar logs:\n${sidecarLogs.join('\n')}`, { cause: error })
    }

    await expect(
      startedSidecar.client.getCapabilities(identity.workspaceInstanceId),
    ).resolves.toMatchObject({
      capabilities: expect.arrayContaining(['control', 'document-session', 'markdown', 'search']),
    })

    await startedSidecar.client.openWorkspace(indexPath)
    await startedSidecar.client.rebuildIndex([
      {
        content: '# Alpha\nneedle lives in this markdown file',
        path: 'alpha.md',
        title: 'Alpha',
      },
    ])

    await expect(startedSidecar.client.search('needle', 10)).resolves.toEqual([
      expect.objectContaining({
        path: 'alpha.md',
        snippet: 'needle lives in this markdown file',
      }),
    ])

    await expect(
      startedSidecar.client.openMarkdownDocument(identity.workspaceInstanceId, {
        content: '# Alpha\nSee [[Beta]]',
        documentId: 'alpha.md',
        uri: 'file:///workspace/alpha.md',
        version: 1,
      }),
    ).resolves.toEqual({ acknowledged: { documentId: 'alpha.md', version: '1' } })

    await expect(startedSidecar.client.getMarkdownDocumentSymbols('alpha.md', 1)).resolves.toEqual([
      expect.objectContaining({
        level: 1,
        name: 'Alpha',
        slug: 'alpha',
      }),
    ])
    await expect(startedSidecar.client.getMarkdownLinks('alpha.md', 1)).resolves.toEqual([
      expect.objectContaining({
        sourceDocumentId: 'alpha.md',
        target: 'Beta',
        text: 'Beta',
      }),
    ])
  }, 20_000)
})

const createLogger = (logs: string[]) =>
  ({
    info: (message: string) => {
      logs.push(message)
    },
    warn: (message: string) => {
      logs.push(message)
    },
  }) as unknown as Logger
