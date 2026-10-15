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

describe('Git selected index and worktree operations', { timeout: 30_000 }, () => {
  it('unstages unborn HEAD files and commits only index versions', async () => {
    const { root, service, write } = await createLocalFixture(roots, false)
    await write('first.md', 'first\n')
    expect((await service.stage(root, ['first.md'])).staged).toHaveLength(1)
    expect((await service.unstage(root, ['first.md'])).untracked).toHaveLength(1)
    await service.stage(root, ['first.md'])
    await write('first.md', 'later\n')
    await write('unselected.md', 'unselected\n')
    const committed = await service.commitStaged(root, 'first commit')
    expect(committed.unstaged.map((file) => file.path)).toEqual(['first.md'])
    expect(committed.untracked.map((file) => file.path)).toEqual(['unselected.md'])
    expect(await gitTestCommand(root, ['show', 'HEAD:first.md'])).toBe('first\n')
    await expect(service.commitStaged(root, 'empty')).rejects.toThrow('No staged')
  })

  it('discards only worktree edits and preserves the staged version', async () => {
    const { root, service, write } = await createLocalFixture(roots)
    await write('base.md', 'staged\n')
    await service.stage(root, ['base.md'])
    await write('base.md', 'unstaged\n')
    await write('selected.md', 'remove\n')
    await write('keep.md', 'keep\n')
    const state = await service.discard(root, ['base.md', 'selected.md'])
    expect(state.staged.map((file) => file.path)).toEqual(['base.md'])
    expect(state.unstaged).toEqual([])
    expect(state.untracked.map((file) => file.path)).toEqual(['keep.md'])
    expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('staged\n')
    await expect(fs.access(path.join(root, 'selected.md'))).rejects.toThrow()
    expect(await gitTestCommand(root, ['show', 'HEAD:base.md'])).toBe('base\n')
  })

  it('handles renames, deletes, and names resembling pathspecs literally', async () => {
    const { root, service, write } = await createLocalFixture(roots)
    await fs.rename(path.join(root, 'base.md'), path.join(root, 'renamed.md'))
    const renamed = await service.stage(root, ['base.md', 'renamed.md'])
    expect(renamed.staged[0]).toMatchObject({
      path: 'renamed.md',
      old_path: 'base.md',
      status: 'renamed',
    })
    const unstaged = await service.unstage(root, ['renamed.md'])
    expect(unstaged.staged).toEqual([])
    expect(unstaged.unstaged).toEqual([
      expect.objectContaining({ path: 'base.md', status: 'deleted' }),
    ])
    await service.discard(root, ['base.md'])
    await write(':(glob)*.md', 'literal\n')
    await write('other.md', 'not staged\n')
    const literal = await service.stage(root, [':(glob)*.md'])
    expect(literal.staged.map((file) => file.path)).toEqual([':(glob)*.md'])
    await service.commitStaged(root, 'literal path')
    await fs.unlink(path.join(root, 'base.md'))
    expect((await service.stage(root, ['base.md'])).staged).toEqual([
      expect.objectContaining({ status: 'deleted' }),
    ])
  })

  it('validates every selection before mutation and refuses metadata, directories and symlinks', async () => {
    const { root, service, write } = await createLocalFixture(roots)
    await write('allowed.md', 'allowed\n')
    const invalid = [
      '../outside',
      '.git/config',
      'nested/../allowed.md',
      '/tmp/outside',
      'C:/outside',
      'nested\\outside',
    ]
    for (const file of invalid) {
      await expect(service.stage(root, ['allowed.md', file])).rejects.toThrow()
      expect((await service.status(root)).staged).toEqual([])
    }
    await fs.mkdir(path.join(root, 'directory'))
    await expect(service.stage(root, ['directory'])).rejects.toThrow('directory')
    await fs.symlink(path.join(root, 'allowed.md'), path.join(root, 'link.md'))
    await fs.symlink(
      path.join(root, '.git'),
      path.join(root, 'linked-dir'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    for (const file of ['link.md', 'linked-dir/config']) {
      await expect(service.stage(root, [file])).rejects.toThrow('symlink')
      await expect(service.discard(root, [file])).rejects.toThrow('symlink')
    }
    expect(await fs.readFile(path.join(root, 'allowed.md'), 'utf8')).toBe('allowed\n')
  })

  it('refuses submodule selections even when their directories are missing', async () => {
    const { root, service } = await createLocalFixture(roots)
    const head = (await gitTestCommand(root, ['rev-parse', 'HEAD'])).trim()
    await gitTestCommand(root, ['update-index', '--add', '--cacheinfo', `160000,${head},module`])
    await expect(service.stage(root, ['module/file.md'])).rejects.toThrow('Submodule')
    await expect(service.unstage(root, ['module'])).rejects.toThrow('Submodule')
  })
})
