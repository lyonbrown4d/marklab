import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'

import { writeDownloadAtomically } from '@electron/services/sync/webdavSync/atomicDownload'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })))
})

describe('writeDownloadAtomically', () => {
  it('writes a verified stream through a temporary file and atomically renames it', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-download-'))
    roots.push(root)
    const body = Buffer.from('remote content')

    await writeDownloadAtomically({
      root,
      relativePath: 'notes/a.md',
      source: Readable.from([body]),
      expectedHash: createHash('sha256').update(body).digest('hex'),
      expectedSize: body.length,
    })

    await expect(fs.readFile(path.join(root, 'notes', 'a.md'), 'utf8')).resolves.toBe(
      'remote content',
    )
  })

  it('cleans partial files when verification fails', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-download-fail-'))
    roots.push(root)

    await expect(
      writeDownloadAtomically({
        root,
        relativePath: 'notes/a.md',
        source: Readable.from(['corrupt']),
        expectedHash: 'a'.repeat(64),
        expectedSize: 7,
      }),
    ).rejects.toMatchObject({ code: 'remote_io', message: expect.stringMatching(/integrity/i) })

    await expect(fs.stat(path.join(root, 'notes', 'a.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
    const notes = await fs.readdir(path.join(root, 'notes'))
    expect(notes).toEqual([])
  })

  it('never replaces an existing file when exclusive publish is requested', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-download-exclusive-'))
    roots.push(root)
    const body = Buffer.from('remote content')
    await fs.writeFile(path.join(root, 'conflict.md'), 'local content')

    await expect(
      writeDownloadAtomically({
        root,
        relativePath: 'conflict.md',
        source: Readable.from([body]),
        expectedHash: createHash('sha256').update(body).digest('hex'),
        expectedSize: body.length,
        overwrite: false,
      }),
    ).rejects.toMatchObject({ code: 'EEXIST' })

    await expect(fs.readFile(path.join(root, 'conflict.md'), 'utf8')).resolves.toBe('local content')
  })

  it('rejects an existing symlink parent that escapes the workspace', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-download-link-'))
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-sync-download-outside-'))
    roots.push(root, outside)
    await fs.symlink(
      outside,
      path.join(root, 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const body = Buffer.from('must stay inside')

    await expect(
      writeDownloadAtomically({
        root,
        relativePath: 'linked/escaped.txt',
        source: Readable.from([body]),
        expectedHash: createHash('sha256').update(body).digest('hex'),
        expectedSize: body.length,
      }),
    ).rejects.toThrow(/symbolic link/i)
    await expect(fs.stat(path.join(outside, 'escaped.txt'))).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })
})
