import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  collectOpenTargetCandidates,
  resolveExistingOpenTargets,
} from '@electron/main/openTargets.js'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })),
  )
})

const createTempRoot = async (): Promise<string> => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'marklab-open-targets-'))
  tempRoots.push(root)
  return root
}

describe('native open targets', () => {
  it('collects unique path-like arguments and filters flags and urls', () => {
    const cwd = '/workspace'

    expect(
      collectOpenTargetCandidates(
        ['--inspect', 'marklab://open?id=1', 'notes/a.md', '/tmp/project', 'notes/a.md'],
        cwd,
      ),
    ).toEqual([path.resolve(cwd, 'notes/a.md'), '/tmp/project'])
  })

  it('resolves only existing files and directories', async () => {
    const root = await createTempRoot()
    const filePath = path.join(root, 'note.md')
    const dirPath = path.join(root, 'project')
    await fs.writeFile(filePath, '# Note')
    await fs.mkdir(dirPath)

    await expect(
      resolveExistingOpenTargets(['note.md', 'project', 'missing.md'], root),
    ).resolves.toEqual([filePath, dirPath])
  })
})
