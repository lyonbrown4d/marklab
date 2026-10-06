import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { scanWorkspace } from '@electron/services/sync/webdavSync/localScanner'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('scanWorkspace', () => {
  it('streams hashes for user files and excludes metadata and temporary content', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-scan-'))
    roots.push(root)
    await fs.mkdir(path.join(root, '.git'), { recursive: true })
    await fs.mkdir(path.join(root, 'assets'), { recursive: true })
    await fs.writeFile(path.join(root, 'notes.md'), 'hello')
    await fs.writeFile(path.join(root, 'assets', 'image.bin'), Buffer.from([1, 2, 3]))
    await fs.writeFile(path.join(root, '.git', 'index'), 'secret')
    await fs.writeFile(path.join(root, 'draft.tmp'), 'temporary')

    const result = await scanWorkspace(root, { deviceId: 'device-a', maxFileSize: 32 })

    expect(result.entries.map(({ path: relativePath }) => relativePath).sort()).toEqual([
      'assets/image.bin',
      'notes.md',
    ])
    expect(result.entries.every(({ hash }) => /^[a-f0-9]{64}$/.test(hash))).toBe(true)
  })

  it('skips oversized files without reading them into memory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-large-'))
    roots.push(root)
    await fs.writeFile(path.join(root, 'large.bin'), Buffer.alloc(33, 1))

    const result = await scanWorkspace(root, { deviceId: 'device-a', maxFileSize: 32 })

    expect(result.entries).toEqual([])
    expect(result.skipped).toEqual([{ path: 'large.bin', reason: 'file_too_large', size: 33 }])
  })

  it('excludes protected directories without case-sensitive gaps', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-protected-'))
    roots.push(root)
    for (const directory of ['.GIT', '.MarkLab-Sync', 'NODE_MODULES']) {
      await fs.mkdir(path.join(root, 'nested', directory), { recursive: true })
      await fs.writeFile(path.join(root, 'nested', directory, 'secret.md'), 'secret')
    }
    await fs.writeFile(path.join(root, 'visible.md'), 'visible')

    const result = await scanWorkspace(root, { deviceId: 'device-a', maxFileSize: 32 })

    expect(result.entries.map((entry) => entry.path)).toEqual(['visible.md'])
  })

  it('fails closed when local paths alias on portable filesystems', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-alias-'))
    roots.push(root)
    await fs.writeFile(path.join(root, 'caf\u00e9.md'), 'one')
    await fs.writeFile(path.join(root, 'cafe\u0301.md'), 'two')

    await expect(scanWorkspace(root, { deviceId: 'device-a', maxFileSize: 32 })).rejects.toThrow(
      /conflict|alias/i,
    )
  })

  it('uses NFC manifest paths without losing decomposed on-disk directories', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-nfc-'))
    roots.push(root)
    await fs.mkdir(path.join(root, 'cafe\u0301'))
    await fs.writeFile(path.join(root, 'cafe\u0301', 'note.md'), 'hello')

    const result = await scanWorkspace(root, { deviceId: 'device-a', maxFileSize: 32 })

    expect(result.entries.map((entry) => entry.path)).toEqual(['caf\u00e9/note.md'])
  })

  it('never follows a symbolic link outside the workspace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-link-root-'))
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-link-outside-'))
    roots.push(root, outside)
    await fs.writeFile(path.join(outside, 'secret.md'), 'secret')
    try {
      await fs.symlink(outside, path.join(root, 'linked'), 'junction')
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'EPERM') return
      throw error
    }

    const result = await scanWorkspace(root, { deviceId: 'device-a', maxFileSize: 32 })

    expect(result.entries).toEqual([])
  })
})
