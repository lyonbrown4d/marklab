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

describe('Git branch, history and recovery operations', { timeout: 30_000 }, () => {
  it('creates, switches and deletes branches with explicit force for unmerged work', async () => {
    const { root, service, commit, write } = await createLocalFixture(roots)
    await service.createBranch(root, 'feature')
    await service.switchBranch(root, 'feature')
    await commit('feature.md', 'feature\n')
    await service.switchBranch(root, 'main')
    await expect(service.deleteBranch(root, 'feature')).rejects.toThrow()
    await service.deleteBranch(root, 'feature', true)
    expect(await service.branches(root)).toEqual([{ name: 'main', current: true, remote: false }])
    await expect(service.deleteBranch(root, 'main', true)).rejects.toThrow()
    await expect(service.createBranch(root, '-evil')).rejects.toThrow()
    await expect(service.createBranch(root, 'okay', 'HEAD~1')).rejects.toThrow()
    await write('dirty.md', 'dirty\n')
    await expect(service.createBranch(root, 'blocked')).rejects.toMatchObject({
      code: 'git_dirty_worktree',
    })
    await expect(service.switchBranch(root, 'main')).rejects.toMatchObject({
      code: 'git_dirty_worktree',
    })
  })

  it('refuses deleting branches checked out by linked worktrees', async () => {
    const { root, service } = await createLocalFixture(roots)
    await service.createBranch(root, 'linked')
    const linked = await fs.mkdtemp(path.join(path.dirname(root), 'marklab-git-linked-'))
    roots.push(linked)
    await gitTestCommand(root, ['worktree', 'add', linked, 'linked'])
    await expect(service.deleteBranch(root, 'linked', true)).rejects.toThrow()
  })

  it('reads paginated history and initial, renamed, and deleted commit contents', async () => {
    const { root, service, commit } = await createLocalFixture(roots)
    const initial = (await service.history(root))[0]!
    expect(initial).toMatchObject({ subject: 'initial', author: 'Git test', parents: [] })
    expect(await service.commitFiles(root, initial.hash)).toEqual([
      { path: 'base.md', status: 'A' },
    ])
    expect(await service.commitDiff(root, initial.hash, 'base.md')).toMatchObject({
      original_content: '',
      modified_content: 'base\n',
    })
    await fs.rename(path.join(root, 'base.md'), path.join(root, 'renamed.md'))
    await service.stage(root, ['base.md', 'renamed.md'])
    await service.commitStaged(root, 'rename')
    const renamed = (await service.history(root))[0]!
    expect(await service.commitFiles(root, renamed.hash)).toEqual([
      { path: 'renamed.md', old_path: 'base.md', status: 'R100' },
    ])
    expect(await service.commitDiff(root, renamed.hash, 'renamed.md', 'base.md')).toMatchObject({
      original_content: 'base\n',
      modified_content: 'base\n',
    })
    await fs.unlink(path.join(root, 'renamed.md'))
    await service.stage(root, ['renamed.md'])
    await service.commitStaged(root, 'delete')
    const deleted = (await service.history(root))[0]!
    expect(await service.commitDiff(root, deleted.hash, 'renamed.md')).toMatchObject({
      original_content: 'base\n',
      modified_content: '',
    })
    expect((await service.history(root, { limit: 1, skip: 1 }))[0]!.hash).toBe(renamed.hash)
    await expect(service.history(root, { limit: 0 })).rejects.toThrow()
    await expect(service.commitFiles(root, 'HEAD')).rejects.toThrow('full Git commit hash')
    await expect(service.commitDiff(root, initial.hash, '.git/config')).rejects.toThrow()
    await commit('further.md', 'next\n')
  })

  it.each(['soft', 'mixed', 'hard'] as const)(
    'resets %s with distinct index/worktree behavior and a recoverable backup',
    async (mode) => {
      const { root, service, commit, write } = await createLocalFixture(roots)
      const previous = (await service.history(root))[0]!.hash
      const head = await commit('base.md', 'new\n', 'new version')
      await write('dirty.md', 'protect\n')
      await expect(service.reset(root, previous, mode)).rejects.toMatchObject({
        code: 'git_dirty_worktree',
      })
      expect(
        (await service.branches(root)).some((branch) => branch.name.startsWith('marklab-backup')),
      ).toBe(false)
      await service.discard(root, ['dirty.md'])
      const result = await service.reset(root, previous, mode)
      expect(result.status.repo.head).toBe(previous)
      expect(
        (await gitTestCommand(root, ['rev-parse', `refs/heads/${result.backupBranch}`])).trim(),
      ).toBe(head)
      expect(result.status.staged.length).toBe(mode === 'soft' ? 1 : 0)
      expect(result.status.unstaged.length).toBe(mode === 'mixed' ? 1 : 0)
      expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe(
        mode === 'hard' ? 'base\n' : 'new\n',
      )
      if (mode === 'hard') {
        await service.switchBranch(root, result.backupBranch)
        expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('new\n')
      }
    },
  )

  it('saves, applies without consuming, and drops stashes including untracked files', async () => {
    const { root, service, write } = await createLocalFixture(roots)
    await write('base.md', 'stashed\n')
    await write('new.md', 'untracked\n')
    expect((await service.stashSave(root, 'save edits')).unstaged).toEqual([])
    const list = await service.stashList(root)
    expect(list).toEqual([
      expect.objectContaining({ ref: 'stash@{0}', subject: 'On main: save edits' }),
    ])
    const state = await service.stashApply(root, 'stash@{0}')
    expect(state.unstaged).toHaveLength(1)
    expect(state.untracked).toHaveLength(1)
    expect(await service.stashList(root)).toEqual(list)
    await service.stashDrop(root, 'stash@{0}')
    expect(await service.stashList(root)).toEqual([])
    await expect(service.stashDrop(root, 'stash@{999}')).rejects.toThrow('does not exist')
    await expect(service.stashApply(root, 'HEAD')).rejects.toThrow('Invalid stash')
  })
})
