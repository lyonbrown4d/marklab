import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { App, Shell } from 'electron'

import type { KnowledgeEngineService } from '@electron/services/knowledgeEngine/service'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import type { WorkspaceDocument } from '@electron/services/workspace/workspaceDocumentLoader'
import { WorkspaceFileService } from '@electron/services/workspace/workspaceFileService'
import {
  cleanupWorkspaceFileServiceFixtures,
  createKnowledgeServiceMock,
  createWorkspaceWithFactory,
} from '@electron/services/workspace/workspaceFileServiceTestUtils'

afterEach(cleanupWorkspaceFileServiceFixtures)

describe('WorkspaceAnalysisService memory residency', () => {
  it('does not populate the renderer clean-buffer cache while scanning the catalog', async () => {
    const { root, workspace } = await createWorkspaceWithFactory(
      createKnowledgeServiceMock(),
      (app, shell, logger, localHistory, knowledgeService) =>
        new CatalogWorkspaceFileService(app, shell, logger, localHistory, knowledgeService),
    )
    await fs.writeFile(path.join(root, 'note.md'), '# Before')

    await workspace.scanCatalog()
    await fs.writeFile(path.join(root, 'note.md'), '# After')

    await expect(workspace.readFile({ path: 'note.md' })).resolves.toBe('# After')
    workspace.dispose()
  })

  it('uses dirty editor content when scanning the catalog', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspaceWithFactory(
      service,
      (app, shell, logger, localHistory, knowledgeService) =>
        new CatalogWorkspaceFileService(app, shell, logger, localHistory, knowledgeService),
    )
    await fs.writeFile(path.join(root, 'note.md'), '# Disk')
    service.writeWorkspaceFile.mockImplementation(
      async (_id: string, workspaceRoot: string, relativePath: string, content: string) => {
        await fs.writeFile(path.join(workspaceRoot, relativePath), content)
        return { changed: true, kind: 'file' as const }
      },
    )
    await workspace.openFile({ path: 'note.md' })
    workspace.updateBuffer({ path: 'note.md', content: '# Dirty' })

    await expect(workspace.scanCatalog()).resolves.toEqual([
      { path: 'note.md', content: '# Dirty' },
    ])
    await workspace.flushBuffers()
    workspace.dispose()
  })

  it('reconciles a dirty buffer created while a catalog read is pending', async () => {
    const service = createKnowledgeServiceMock()
    let releaseRead!: (content: string) => void
    const pendingRead = new Promise<string>((resolve) => {
      releaseRead = resolve
    })
    service.readWorkspaceFile.mockReturnValue(pendingRead)
    const { root, workspace } = await createWorkspaceWithFactory(
      service,
      (app, shell, logger, localHistory, knowledgeService) =>
        new CatalogWorkspaceFileService(app, shell, logger, localHistory, knowledgeService),
    )
    await fs.writeFile(path.join(root, 'note.md'), '# Disk')
    service.writeWorkspaceFile.mockImplementation(
      async (_id: string, workspaceRoot: string, relativePath: string, content: string) => {
        await fs.writeFile(path.join(workspaceRoot, relativePath), content)
        return { changed: true, kind: 'file' as const }
      },
    )
    const scan = workspace.scanCatalog()
    await vi.waitFor(() => expect(service.readWorkspaceFile).toHaveBeenCalledOnce())
    workspace.updateBuffer({ path: 'note.md', content: '# Dirty' })
    releaseRead('# Disk')

    await expect(scan).resolves.toEqual([{ path: 'note.md', content: '# Dirty' }])
    await expect(workspace.flushBuffers()).resolves.toBeUndefined()
    workspace.dispose()
  })
})

class CatalogWorkspaceFileService extends WorkspaceFileService {
  constructor(
    app: App,
    shell: Shell,
    logger: Logger,
    localHistory: LocalHistoryServiceContract,
    knowledgeEngineService: KnowledgeEngineService,
  ) {
    super(app, shell, logger, localHistory, knowledgeEngineService)
  }

  scanCatalog(): Promise<WorkspaceDocument[]> {
    return this.workspaceDocuments()
  }
}
