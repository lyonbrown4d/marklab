import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { App, Shell } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import { WorkspaceAnalysisService } from '@electron/services/workspace/workspaceAnalysisService'
import { WorkspaceAnalysisScheduler } from '@electron/services/workspace/workspaceAnalysisConcurrency'
import { trySidecarMarkdownDiagnostics } from '@electron/services/workspace/workspaceSidecarFileBridge'

vi.mock('@electron/services/workspace/workspaceAnalysisWorkerClient', () => ({
  WorkspaceAnalysisWorkerClient: class {
    run = vi.fn(async () => [
      {
        end_column: 20,
        line: 1,
        message: 'Cannot find linked file "missing.md"',
        severity: 'error',
        start_column: 11,
      },
    ])
    terminate = vi.fn()
  },
}))

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('WorkspaceAnalysisService Markdown diagnostics', () => {
  it('runs local diagnostics CPU work through the injected cross-window scheduler', async () => {
    const scheduler = new WorkspaceAnalysisScheduler({ concurrency: 1 })
    const schedule = vi.spyOn(scheduler, 'run')
    const sidecar = createSidecarMock(vi.fn(async () => []))
    const { workspace } = await createWorkspace(sidecar, scheduler)

    try {
      await workspace.analyzeMarkdownBuffer({ content: '# Alpha', path: 'alpha.md' })
      expect(schedule).toHaveBeenCalledOnce()
    } finally {
      workspace.dispose()
    }
  })

  it('merges and sorts custom diagnostics with Node sidecar reference diagnostics', async () => {
    const supplemental = {
      end_column: 16,
      line: 2,
      message: "No link definition found: 'missing-ref'",
      severity: 'warning' as const,
      start_column: 9,
    }
    const sidecar = createSidecarMock(vi.fn(async () => [supplemental, supplemental]))
    const { workspace } = await createWorkspace(sidecar)

    try {
      const diagnostics = await workspace.analyzeMarkdownBuffer({
        content: ['[Missing](missing.md)', '[Ref][missing-ref]'].join('\n'),
        path: 'alpha.md',
      })

      expect(diagnostics).toEqual([
        expect.objectContaining({ line: 1, message: 'Cannot find linked file "missing.md"' }),
        supplemental,
      ])
    } finally {
      workspace.dispose()
    }
  })

  it('keeps custom diagnostics when the Node sidecar fails', async () => {
    const sidecar = createSidecarMock(vi.fn(async () => Promise.reject(new Error('sidecar down'))))
    const { logger, workspace } = await createWorkspace(sidecar)

    try {
      await expect(
        workspace.analyzeMarkdownBuffer({
          content: '[Missing](missing.md)',
          path: 'alpha.md',
        }),
      ).resolves.toEqual([
        expect.objectContaining({
          message: 'Cannot find linked file "missing.md"',
          severity: 'error',
        }),
      ])
      expect(logger.warn).toHaveBeenCalledWith(
        'markdown diagnostics sidecar failed; using local diagnostics',
        expect.objectContaining({ error: expect.any(Error), path: 'alpha.md' }),
      )
    } finally {
      workspace.dispose()
    }
  })

  it('sends the dirty buffer to the sidecar instead of the saved file', async () => {
    const getMarkdownDiagnostics = vi.fn(async () => [])
    const sidecar = createSidecarMock(getMarkdownDiagnostics)
    const { workspace } = await createWorkspace(sidecar)
    const dirtyContent = '[Dirty][missing-dirty]'

    try {
      await workspace.analyzeMarkdownBuffer({ content: dirtyContent, path: 'alpha.md' })

      expect(getMarkdownDiagnostics).toHaveBeenCalledWith(
        expect.stringMatching(/^vfs:/),
        expect.any(String),
        'alpha.md',
        dirtyContent,
        expect.anything(),
      )
    } finally {
      workspace.dispose()
    }
  })

  it('falls back promptly when sidecar diagnostics time out', async () => {
    const logger = createLogger()
    const pending = new Promise<never>(() => undefined)
    let receivedSignal: AbortSignal | undefined
    const getMarkdownDiagnostics = vi.fn(
      (...args: [string, string, string, string, AbortSignal?]) => {
        receivedSignal = args[4]
        return pending
      },
    )

    await expect(
      trySidecarMarkdownDiagnostics({
        content: '[Pending][reference]',
        knowledgeEngineService: createSidecarMock(getMarkdownDiagnostics),
        logger,
        path: 'alpha.md',
        state: {
          internalRoot: 'C:/marklab/internal',
          rootKind: 'external',
          rootPath: 'C:/marklab/workspace',
          singleFile: null,
        },
        timeoutMs: 1,
      }),
    ).resolves.toEqual([])
    expect(logger.warn).toHaveBeenCalledWith(
      'markdown diagnostics sidecar failed; using local diagnostics',
      expect.objectContaining({ error: expect.objectContaining({ name: 'TimeoutError' }) }),
    )
    expect(receivedSignal?.aborted).toBe(true)
  })
})

const createWorkspace = async (
  service: KnowledgeEngineService,
  workspaceAnalysisScheduler?: WorkspaceAnalysisScheduler,
) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-md-diagnostics-'))
  tempRoots.push(root)
  await fs.writeFile(path.join(root, 'alpha.md'), '# Alpha', 'utf8')
  const logger = createLogger()
  const workspace = new WorkspaceAnalysisService(
    {
      getPath: vi.fn(() => path.join(root, 'app-data')),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as App,
    { openPath: vi.fn(async () => '') } as unknown as Shell,
    logger,
    createLocalHistoryService(),
    undefined,
    service,
    { workspaceAnalysisScheduler },
  )
  await workspace.setRoot({ path: root })
  return { logger, workspace }
}

const createSidecarMock = (getMarkdownDiagnostics: ReturnType<typeof vi.fn>) =>
  ({
    getMarkdownDiagnostics,
    readWorkspaceFile: vi.fn(
      async (_workspaceId: string, workspaceRoot: string, relativePath: string) =>
        fs.readFile(path.join(workspaceRoot, ...relativePath.split('/')), 'utf8'),
    ),
  }) as unknown as KnowledgeEngineService

const createLocalHistoryService = (): LocalHistoryServiceContract =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' as const })),
  }) as unknown as LocalHistoryServiceContract

const createLogger = (): Logger & { warn: ReturnType<typeof vi.fn> } => {
  const logger = {
    child: vi.fn(() => logger),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as Logger & { warn: ReturnType<typeof vi.fn> }
  return logger
}
