import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import type { App, Shell } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'

vi.mock('@parcel/watcher', () => ({
  default: {
    subscribe: vi.fn(async () => ({ unsubscribe: vi.fn(async () => undefined) })),
  },
}))

const roots: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('workspace snapshot performance', () => {
  it('does not put the sidecar cold start on the interactive snapshot path', async () => {
    const fixture = await createWorkspace()
    fixture.knowledge.getWorkspaceFileSnapshot.mockRejectedValue(
      new Error('cold sidecar should not serve the file tree'),
    )

    const snapshot = await fixture.workspace.snapshot()

    expect(snapshot.entries).toContainEqual({ kind: 'file', name: 'note.md', path: 'note.md' })
    expect(fixture.knowledge.getWorkspaceFileSnapshot).not.toHaveBeenCalled()
    fixture.workspace.dispose()
  })

  it('reuses one directory scan until a structural mutation invalidates it', async () => {
    const fixture = await createWorkspace()
    const readdir = vi.spyOn(fs, 'readdir')

    await fixture.workspace.snapshot()
    const firstScanCalls = readdir.mock.calls.length
    await fixture.workspace.snapshot()

    expect(firstScanCalls).toBeGreaterThan(0)
    expect(readdir).toHaveBeenCalledTimes(firstScanCalls)
    expect(fixture.logger.debug).toHaveBeenCalledWith(
      'workspace path snapshot reused',
      expect.objectContaining({ cacheHit: true, rootKind: 'external' }),
    )

    await fixture.workspace.createFile({ path: 'fresh.md' })
    const refreshed = await fixture.workspace.snapshot()

    expect(readdir.mock.calls.length).toBeGreaterThan(firstScanCalls)
    expect(refreshed.entries).toContainEqual({ kind: 'file', name: 'fresh.md', path: 'fresh.md' })
    expect(fixture.logger.info).toHaveBeenCalledWith(
      'workspace path snapshot refreshed',
      expect.objectContaining({
        cacheHit: false,
        durationMs: expect.any(Number),
        entryCount: expect.any(Number),
        knownPathCount: expect.any(Number),
        rootKind: 'external',
      }),
    )
    fixture.workspace.dispose()
  })

  it('prewarms the latest workspace root in the background', async () => {
    vi.useFakeTimers()
    const fixture = await createWorkspace()

    await vi.advanceTimersByTimeAsync(100)
    await fixture.workspace.snapshot()

    expect(fixture.knowledge.prepareWorkspaceFileAccess).toHaveBeenCalledOnce()
    expect(fixture.knowledge.prepareWorkspaceFileAccess).toHaveBeenCalledWith(
      expect.stringMatching(/^vfs:/),
      fixture.root,
    )
    expect(fixture.logger.info).toHaveBeenCalledWith(
      'workspace path snapshot refreshed',
      expect.objectContaining({ cacheHit: false, rootKind: 'external' }),
    )
    expect(fixture.logger.debug).toHaveBeenCalledWith(
      'workspace path snapshot reused',
      expect.objectContaining({ cacheHit: true, rootKind: 'external' }),
    )
    fixture.workspace.dispose()
  })

  it('keeps the snapshot root consistent when the workspace changes during a scan', async () => {
    const fixture = await createWorkspace()
    const nextRoot = path.join(path.dirname(fixture.root), 'next-workspace')
    await fs.mkdir(nextRoot)
    let finishScan!: (value: {
      entries: Array<{ kind: 'file'; name: string; path: string }>
      knownPaths: { assetPaths: string[]; paths: string[] }
    }) => void
    const delayedScan = new Promise<{
      entries: Array<{ kind: 'file'; name: string; path: string }>
      knownPaths: { assetPaths: string[]; paths: string[] }
    }>((resolve) => {
      finishScan = resolve
    })
    const pathSnapshots = (
      fixture.workspace as unknown as { pathSnapshots: { get: () => typeof delayedScan } }
    ).pathSnapshots
    vi.spyOn(pathSnapshots, 'get').mockReturnValueOnce(delayedScan)

    const pendingSnapshot = fixture.workspace.snapshot()
    await fixture.workspace.setRoot({ path: nextRoot })
    finishScan({
      entries: [{ kind: 'file', name: 'next.md', path: 'next.md' }],
      knownPaths: { assetPaths: [], paths: ['next.md'] },
    })

    await expect(pendingSnapshot).resolves.toEqual({
      entries: [{ kind: 'file', name: 'next.md', path: 'next.md' }],
      root: { kind: 'external', path: nextRoot },
    })
    fixture.workspace.dispose()
  })
})

const createWorkspace = async () => {
  const base = await fs.mkdtemp(path.join(tmpdir(), 'marklab-snapshot-performance-'))
  roots.push(base)
  const appData = path.join(base, 'app-data')
  const root = path.join(base, 'workspace')
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(path.join(root, 'note.md'), '# Note')
  const logger = createLogger()
  const knowledge = createKnowledgeService(root)
  const workspace = new WorkspaceFileService(
    createApp(appData),
    createShell(),
    logger,
    createLocalHistoryService(),
    knowledge,
  )
  await workspace.setRoot({ path: root })
  return { knowledge, logger, root, workspace }
}

const createKnowledgeService = (root: string) => {
  const service = {
    createWorkspaceFile: vi.fn(async (_id: string, workspaceRoot: string, relativePath: string) => {
      await fs.writeFile(path.join(workspaceRoot, relativePath), '')
      return { changed: true, kind: 'file' as const }
    }),
    getWorkspaceFileSnapshot: vi.fn(),
    prepareWorkspaceFileAccess: vi.fn(async () => undefined),
  }
  void root
  return service as unknown as KnowledgeEngineService & typeof service
}

const createLogger = () => {
  const logger = {
    child: vi.fn(() => logger),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
  return logger as unknown as Logger & typeof logger
}

const createApp = (userDataPath: string) =>
  ({
    getPath: vi.fn(() => userDataPath),
    on: vi.fn(),
    removeListener: vi.fn(),
  }) as unknown as App

const createShell = () => ({ openPath: vi.fn(async () => '') }) as unknown as Shell

const createLocalHistoryService = () =>
  ({
    capture: vi.fn(async () => ({ status: 'skipped', reason: 'duplicate' as const })),
  }) as unknown as LocalHistoryServiceContract
