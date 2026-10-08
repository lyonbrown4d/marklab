import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupWorkspaceFileServiceFixtures,
  createKnowledgeServiceMock,
  createWorkspace,
} from '@electron/services/workspace/workspaceFileServiceTestUtils'

afterEach(cleanupWorkspaceFileServiceFixtures)

describe('WorkspaceFileService analysis reads', () => {
  it('keeps public file reads cache-backed for renderer latency', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    const file = path.join(root, 'note.md')
    await fs.writeFile(file, '# Before')

    await expect(workspace.readFile({ path: 'note.md' })).resolves.toBe('# Before')
    await expect(workspace.readFile({ path: 'note.md' })).resolves.toBe('# Before')
    expect(service.readWorkspaceFile).toHaveBeenCalledOnce()
    expect(workspace.getBufferStatus({ path: 'note.md' })).toMatchObject({ dirty: false })
    workspace.dispose()
  })

  it('prefers an existing dirty editor buffer over disk content', async () => {
    const service = createKnowledgeServiceMock()
    const { root, workspace } = await createWorkspace(service)
    const file = path.join(root, 'note.md')
    await fs.writeFile(file, '# Disk')
    service.writeWorkspaceFile.mockImplementation(
      async (_id: string, workspaceRoot: string, relativePath: string, content: string) => {
        await fs.writeFile(path.join(workspaceRoot, relativePath), content)
        return { changed: true, kind: 'file' as const }
      },
    )
    await workspace.openFile({ path: 'note.md' })
    workspace.updateBuffer({ path: 'note.md', content: '# Dirty' })

    await expect(workspace.readFile({ path: 'note.md' })).resolves.toBe('# Dirty')
    await workspace.flushBuffers()
    workspace.dispose()
  })
})
