import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FsStateData } from '@electron/services/workspace/types'
import { readWorkspaceExportAsset } from '@electron/services/workspace/workspaceExportAsset'

let root = ''
let state: FsStateData

describe('readWorkspaceExportAsset', () => {
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-export-asset-'))
    state = { rootKind: 'external', rootPath: root, internalRoot: root, singleFile: null }
    await fs.mkdir(path.join(root, 'docs'))
    await fs.mkdir(path.join(root, 'assets'))
    await fs.writeFile(path.join(root, 'docs', 'note.md'), '# Note')
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('reads a parent-relative asset that remains in the workspace', async () => {
    const expected = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    await fs.writeFile(path.join(root, 'assets', 'flow.png'), expected)

    const result = await readWorkspaceExportAsset(
      state,
      'docs/note.md',
      path.join(root, 'docs', 'note.md'),
      '../assets/flow.png',
      1024,
    )

    expect(result).toEqual(expected)
  })

  it('rejects a target outside the workspace', async () => {
    const outside = `${root}-outside.png`
    await fs.writeFile(outside, 'secret')
    try {
      await expect(
        readWorkspaceExportAsset(
          state,
          'docs/note.md',
          path.join(root, 'docs', 'note.md'),
          '../../' + path.basename(outside),
          1024,
        ),
      ).resolves.toBeNull()
    } finally {
      await fs.rm(outside, { force: true })
    }
  })

  it('rejects an asset above the configured byte limit', async () => {
    await fs.writeFile(path.join(root, 'assets', 'large.png'), Buffer.alloc(8))

    await expect(
      readWorkspaceExportAsset(
        state,
        'docs/note.md',
        path.join(root, 'docs', 'note.md'),
        '../assets/large.png',
        4,
      ),
    ).resolves.toBeNull()
  })
})
