import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { createNodeWorkspaceClient } from '@electron/services/knowledgeEngine/nodeWorkspaceClient'
import { WorkspaceSidecarManager } from '@electron/services/knowledgeEngine/workspaceSidecarManager'
import type { Logger } from '@electron/services/logger'

describe('WorkspaceSidecarManager multi-window isolation', () => {
  it('keeps another window searchable when one workspace runtime closes', async () => {
    const appDataRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-multi-window-'))
    const firstRoot = path.join(appDataRoot, 'first')
    const secondRoot = path.join(appDataRoot, 'second')
    await Promise.all([fs.mkdir(firstRoot), fs.mkdir(secondRoot)])
    const logger = { info: vi.fn(), warn: vi.fn() } as unknown as Logger
    const manager = new WorkspaceSidecarManager({
      appDataDir: appDataRoot,
      logger,
      startSidecar: async (_plan, identity) => ({
        address: 'node:utility-process',
        client: createNodeWorkspaceClient(identity.canonicalRoot, identity.engineDataDir),
      }),
    })

    try {
      await Promise.all([manager.open('window-a', firstRoot), manager.open('window-b', secondRoot)])
      await Promise.all([
        manager.rebuildIndex('window-a', [
          { path: 'first.md', title: 'First', content: 'alpha-only' },
        ]),
        manager.rebuildIndex('window-b', [
          { path: 'second.md', title: 'Second', content: 'beta-only' },
        ]),
      ])

      await expect(manager.search('window-a', 'alpha-only', 10)).resolves.toMatchObject([
        { path: 'first.md' },
      ])
      await expect(manager.search('window-b', 'alpha-only', 10)).resolves.toEqual([])
      await manager.close('window-a')

      await expect(manager.search('window-b', 'beta-only', 10)).resolves.toMatchObject([
        { path: 'second.md' },
      ])
      expect(manager.listActive()).toMatchObject([{ workspaceId: 'window-b', state: 'ready' }])
    } finally {
      await manager.closeAll()
      await fs.rm(appDataRoot, { force: true, recursive: true })
    }
  })
})
