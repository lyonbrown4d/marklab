import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  assertWorkspaceRealPathContained,
  normalizeSyncPath,
  portableSyncPathKey,
} from '@electron/services/sync/webdavSync/pathSafety'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('portable sync path policy', () => {
  it.each([
    '.git/config',
    'a/.GIT/config',
    'node_modules/a.js',
    'a/.marklab-sync/state',
    'con',
    'AUX.txt',
    'notes/file.md:secret',
    'notes/name. ',
    'notes/bad?.md',
  ])('rejects unsafe path %s', (unsafePath) => {
    expect(() => normalizeSyncPath(unsafePath)).toThrow(/sync path/i)
  })

  it('normalizes Unicode and computes a case-insensitive portable identity', () => {
    expect(normalizeSyncPath('notes/cafe\u0301.md')).toBe('notes/caf\u00e9.md')
    expect(portableSyncPathKey('Notes/Caf\u00e9.md')).toBe(
      portableSyncPathKey('notes/cafe\u0301.md'),
    )
  })

  it('rejects an existing symlink that resolves outside the workspace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-path-root-'))
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-path-outside-'))
    roots.push(root, outside)
    const link = path.join(root, 'linked')
    try {
      await fs.symlink(outside, link, 'junction')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EPERM') return
      throw error
    }

    await expect(
      assertWorkspaceRealPathContained(root, path.join(link, 'file.md')),
    ).rejects.toThrow(/workspace|contain/i)
  })
})
