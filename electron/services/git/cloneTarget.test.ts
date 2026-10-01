import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { prepareCloneDestination } from '@electron/services/git/cloneTarget.js'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { force: true, recursive: true })
})

describe('clone staging destination', () => {
  it('publishes a same-parent staging directory atomically', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-clone-target-'))
    roots.push(root)
    const target = path.join(root, 'checkout')
    const destination = await prepareCloneDestination(target)

    expect(path.dirname(destination.stagingPath)).toBe(await fs.realpath(root))
    expect(path.basename(destination.stagingPath)).toMatch(/^\.checkout\.marklab-clone-/)
    await fs.writeFile(path.join(destination.stagingPath, 'ready.txt'), 'ready')
    await destination.publish()

    await expect(fs.readFile(path.join(target, 'ready.txt'), 'utf8')).resolves.toBe('ready')
    expect(await fs.readdir(root)).toEqual(['checkout'])
  })

  it('rejects a swapped parent symlink and cleans only staging', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-clone-symlink-'))
    roots.push(root)
    const first = path.join(root, 'first')
    const second = path.join(root, 'second')
    const link = path.join(root, 'selected')
    await fs.mkdir(first)
    await fs.mkdir(second)
    await fs.symlink(first, link, process.platform === 'win32' ? 'junction' : 'dir')
    const destination = await prepareCloneDestination(path.join(link, 'checkout'))
    await fs.writeFile(path.join(destination.stagingPath, 'partial.txt'), 'partial')
    await fs.rm(link, { force: true })
    await fs.symlink(second, link, process.platform === 'win32' ? 'junction' : 'dir')

    await expect(destination.publish()).rejects.toThrow('parent changed')
    await destination.cleanup()

    await expect(fs.stat(path.join(second, 'checkout'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await fs.readdir(first)).toEqual([])
  })

  it('refuses to recursively clean a replaced staging directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-clone-replaced-staging-'))
    roots.push(root)
    const destination = await prepareCloneDestination(path.join(root, 'checkout'))
    const original = `${destination.stagingPath}-original`
    await fs.rename(destination.stagingPath, original)
    await fs.mkdir(destination.stagingPath)
    await fs.writeFile(path.join(destination.stagingPath, 'must-survive.txt'), 'safe')

    await expect(destination.cleanup()).rejects.toThrow('staging directory changed')
    await expect(
      fs.readFile(path.join(destination.stagingPath, 'must-survive.txt'), 'utf8'),
    ).resolves.toBe('safe')
  })
})
