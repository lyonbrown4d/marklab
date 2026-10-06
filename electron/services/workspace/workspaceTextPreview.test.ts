import fs from 'node:fs/promises'
import path from 'node:path'
import type { App, Shell } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LocalHistoryServiceContract } from '@electron/services/localHistory/types'
import type { Logger } from '@electron/services/logger'
import { WorkspaceService } from '@electron/services/workspace/workspaceService'

vi.mock('@parcel/watcher', () => ({
  default: { subscribe: vi.fn(async () => ({ unsubscribe: vi.fn(async () => undefined) })) },
}))

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
  )
})

describe('WorkspaceService.readTextPreview', () => {
  it('reads at most limit plus one byte and reports truncation without caching', async () => {
    const { root, workspace } = await createWorkspace()
    await fs.mkdir(path.join(root, 'src'))
    await fs.writeFile(path.join(root, 'src/example.ts'), '0123456789')

    await expect(
      workspace.readTextPreview({ limit_bytes: 4, path: 'src/example.ts' }),
    ).resolves.toEqual({ content: '0123', truncated: true })
    expect(workspace.getBufferStatus({ path: 'src/example.ts' })).toBeNull()

    await workspace.readFile({ path: 'src/example.ts' })
    workspace.updateBuffer({ path: 'src/example.ts', content: 'dirty buffer' })
    await expect(
      workspace.readTextPreview({ limit_bytes: 20, path: 'src/example.ts' }),
    ).resolves.toEqual({ content: '0123456789', truncated: false })
    await workspace.flushBuffers()
    workspace.dispose()
  })

  it('validates paths and byte limits before reading', async () => {
    const { workspace } = await createWorkspace()

    await expect(
      workspace.readTextPreview({ limit_bytes: 16, path: '../outside.ts' }),
    ).rejects.toThrow()
    await expect(
      workspace.readTextPreview({ limit_bytes: 0, path: 'src/example.ts' }),
    ).rejects.toThrow('limit_bytes')
    await expect(
      workspace.readTextPreview({ limit_bytes: 1024 * 1024 + 1, path: 'src/example.ts' }),
    ).rejects.toThrow('limit_bytes')
    workspace.dispose()
  })

  it('drops an incomplete trailing UTF-8 sequence from a truncated preview', async () => {
    const { root, workspace } = await createWorkspace()
    await fs.writeFile(path.join(root, 'utf8.txt'), 'éé')

    await expect(workspace.readTextPreview({ limit_bytes: 3, path: 'utf8.txt' })).resolves.toEqual({
      content: 'é',
      truncated: true,
    })
    workspace.dispose()
  })
})

const createWorkspace = async () => {
  const base = await fs.mkdtemp(path.join(tempDirectory(), 'marklab-preview-'))
  tempRoots.push(base)
  const root = path.join(base, 'workspace')
  await fs.mkdir(root)
  const workspace = new WorkspaceService(
    {
      getPath: vi.fn(() => path.join(base, 'app-data')),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as App,
    { openPath: vi.fn(async () => '') } as unknown as Shell,
    createLogger(),
    {
      capture: vi.fn(async () => ({ reason: 'duplicate', status: 'skipped' as const })),
    } as unknown as LocalHistoryServiceContract,
  )
  await workspace.setRoot({ path: root })
  return { root, workspace }
}

const tempDirectory = () =>
  path.resolve(process.env.TMPDIR ?? process.env.TEMP ?? process.env.TMP ?? '.')

const createLogger = () => {
  const logger = { child: vi.fn(() => logger), error: vi.fn(), info: vi.fn(), warn: vi.fn() }
  return logger as unknown as Logger
}
