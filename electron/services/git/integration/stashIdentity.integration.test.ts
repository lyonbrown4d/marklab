import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createLocalFixture,
  removeLocalFixtures,
} from '@electron/services/git/integration/localFixture'
import { gitTestCommand } from '@electron/services/git/testSupport'

const roots: string[] = []
afterEach(() => removeLocalFixtures(roots))

describe('Git stash confirmation identity', { timeout: 30_000 }, () => {
  it('rejects stale apply/drop after an external stash push and accepts current matching hashes', async () => {
    const { root, service, write } = await createLocalFixture(roots)
    await write('base.md', 'original stash\n')
    await service.stashSave(root, 'original')
    const original = (await service.stashList(root))[0]!
    await write('base.md', 'newer stash\n')
    await gitTestCommand(root, ['stash', 'push', '-m', 'external newer stash'])
    const before = await gitTestCommand(root, ['stash', 'list', '--format=%H'])

    await expect(service.stashApply(root, original.ref, original.hash)).rejects.toMatchObject({
      code: 'git_invalid_input',
      message: expect.stringContaining('Stash entry changed'),
    })
    await expect(service.stashDrop(root, original.ref, original.hash)).rejects.toThrow(
      'Stash entry changed',
    )
    expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('base\n')
    expect(await gitTestCommand(root, ['stash', 'list', '--format=%H'])).toBe(before)

    const current = (await service.stashList(root))[0]!
    expect(current.hash).not.toBe(original.hash)
    await service.stashApply(root, current.ref, current.hash.toUpperCase())
    expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('newer stash\n')
    await service.discard(root, ['base.md'])
    await service.stashDrop(root, current.ref, current.hash)
    const remaining = await service.stashList(root)
    expect(remaining).toEqual([expect.objectContaining({ ref: 'stash@{0}', hash: original.hash })])
    await service.stashApply(root, 'stash@{0}', original.hash)
    expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('original stash\n')
  })

  it('rejects selections whose indices disappear after an external stash drop', async () => {
    const { root, service, write } = await createLocalFixture(roots)
    await write('base.md', 'older\n')
    await service.stashSave(root, 'older')
    await write('base.md', 'newer\n')
    await service.stashSave(root, 'newer')
    const selected = (await service.stashList(root))[1]!
    await gitTestCommand(root, ['stash', 'drop', 'stash@{0}'])
    await expect(service.stashApply(root, selected.ref, selected.hash)).rejects.toThrow(
      'does not exist',
    )
    await expect(service.stashDrop(root, selected.ref, selected.hash)).rejects.toThrow(
      'does not exist',
    )
    expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('base\n')
    expect((await service.stashList(root))[0]!.hash).toBe(selected.hash)
  })

  it('validates optional hashes strictly and keeps ref-only callers compatible', async () => {
    const { root, service, write } = await createLocalFixture(roots)
    await write('base.md', 'saved\n')
    await service.stashSave(root)
    const selected = (await service.stashList(root))[0]!
    for (const invalid of ['HEAD', 'a'.repeat(39), 'a'.repeat(41), 'a'.repeat(63), null, 123]) {
      await expect(service.stashApply(root, selected.ref, invalid)).rejects.toThrow(
        'full stash commit hash',
      )
      await expect(service.stashDrop(root, selected.ref, invalid)).rejects.toThrow(
        'full stash commit hash',
      )
    }
    expect((await service.stashList(root))[0]!.hash).toBe(selected.hash)
    await service.stashApply(root, selected.ref)
    expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('saved\n')
    await service.stashDrop(root, selected.ref)
    expect(await service.stashList(root)).toEqual([])
  })
})
