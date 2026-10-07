import fs from 'node:fs/promises'
import type { App, Shell } from 'electron'
import path from 'node:path'
import os from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import { WorkspaceService } from '@electron/services/workspace/workspaceService'

const temporaryRoots: string[] = []
const workspaces: WorkspaceService[] = []

afterEach(async () => {
  for (const workspace of workspaces.splice(0)) workspace.dispose()
  await Promise.all(
    temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('workspace binary asset import', () => {
  it('writes binary clipboard data without a base64 transport expansion', async () => {
    const { root, workspace } = await createWorkspace()
    await fs.writeFile(path.join(root, 'Page.md'), '# Page')
    const bytes = new Uint8Array([137, 80, 78, 71]).buffer

    await expect(
      workspace.importMarkdownAssetBytes({
        bytes,
        documentPath: 'Page.md',
        fileName: 'paste.png',
        title: null,
      }),
    ).resolves.toMatchObject({
      copied: true,
      markdown_target: 'Page.assets/paste.png',
      relative_path: 'Page.assets/paste.png',
    })
    await expect(fs.readFile(path.join(root, 'Page.assets', 'paste.png'))).resolves.toEqual(
      Buffer.from(bytes),
    )
  })

  it('rejects non-binary payloads at the main-process boundary', async () => {
    const { workspace } = await createWorkspace()
    await fs.writeFile(path.join(workspace.rootInfo().path, 'Page.md'), '# Page')

    await expect(
      workspace.importMarkdownAssetBytes({
        bytes: 'iVBORw0KGgo=',
        documentPath: 'Page.md',
        fileName: 'paste.png',
        title: null,
      }),
    ).rejects.toThrow('bytes must be binary data')
  })

  it('rejects binary imports larger than the bounded IPC payload', async () => {
    const { workspace } = await createWorkspace()
    await fs.writeFile(path.join(workspace.rootInfo().path, 'Page.md'), '# Page')

    await expect(
      workspace.importMarkdownAssetBytes({
        bytes: new ArrayBuffer(32 * 1024 * 1024 + 1),
        documentPath: 'Page.md',
        fileName: 'oversized.png',
        title: null,
      }),
    ).rejects.toThrow('too large')
  })
})

const createWorkspace = async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-asset-import-'))
  temporaryRoots.push(base)
  const root = path.join(base, 'workspace')
  await fs.mkdir(root)
  const logger = { child: vi.fn(() => logger), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  const workspace = new WorkspaceService(
    {
      getPath: vi.fn(() => path.join(base, 'app-data')),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as App,
    { openPath: vi.fn(async () => '') } as unknown as Shell,
    logger as unknown as Logger,
    {
      capture: vi.fn(async () => ({ reason: 'duplicate', status: 'skipped' as const })),
    } as unknown as LocalHistoryServiceContract,
  )
  workspaces.push(workspace)
  await workspace.setRoot({ path: root })
  return { root, workspace }
}
