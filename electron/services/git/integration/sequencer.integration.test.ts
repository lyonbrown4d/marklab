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

const diverged = async () => {
  const fixture = await createLocalFixture(roots)
  await fixture.service.createBranch(fixture.root, 'feature')
  await fixture.service.switchBranch(fixture.root, 'feature')
  const feature = await fixture.commit('base.md', 'feature\n', 'feature change')
  await fixture.service.switchBranch(fixture.root, 'main')
  const main = await fixture.commit('base.md', 'main\n', 'main change')
  return { ...fixture, feature, main }
}

describe('Git sequencer conflict and recovery flows', { timeout: 30_000 }, () => {
  it('leaves failed merge conflict state discoverable and continues resolved merges without an editor', async () => {
    const { root, service, write } = await diverged()
    expect(await service.operationState(root)).toEqual({ operation: null })
    expect((await service.status(root)).conflicts).toEqual([])
    await expect(service.merge(root, 'feature')).rejects.toThrow()
    expect(await service.operationState(root)).toEqual({ operation: 'merge' })
    expect((await service.status(root)).conflicts).toHaveLength(1)
    await expect(service.continueOperation(root)).rejects.toMatchObject({
      code: 'git_conflicts_present',
    })
    await expect(service.switchBranch(root, 'feature')).rejects.toThrow('Finish or abort')
    await write('base.md', 'resolved\n')
    await service.stage(root, ['base.md'])
    const state = await service.continueOperation(root)
    expect(state.conflicts).toEqual([])
    expect(await service.operationState(root)).toEqual({ operation: null })
    expect((await service.history(root))[0]!.parents).toHaveLength(2)
    await expect(service.continueOperation(root)).rejects.toThrow('No Git operation')
  })

  it('allows an explicit staged merge-resolution commit and aborts unresolved merges', async () => {
    const { root, service, main, write } = await diverged()
    await expect(service.merge(root, 'feature')).rejects.toThrow()
    await service.abortOperation(root)
    expect((await service.status(root)).repo.head).toBe(main)
    expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('main\n')
    await expect(service.merge(root, 'feature')).rejects.toThrow()
    await write('base.md', 'resolved\n')
    await service.stage(root, ['base.md'])
    await service.commitStaged(root, 'explicit merge resolution')
    expect((await service.history(root))[0]).toMatchObject({
      subject: 'explicit merge resolution',
      parents: expect.any(Array),
    })
    expect(await service.operationState(root)).toEqual({ operation: null })
  })

  it.each(['rebase', 'cherry-pick'] as const)(
    'continues and aborts %s conflicts',
    async (operation) => {
      const { root, service, main, feature, write } = await diverged()
      const start = () =>
        operation === 'rebase' ? service.rebase(root, 'feature') : service.cherryPick(root, feature)
      await expect(start()).rejects.toThrow()
      expect(await service.operationState(root)).toEqual({ operation })
      await service.abortOperation(root)
      expect((await service.status(root)).repo.head).toBe(main)
      await expect(start()).rejects.toThrow()
      await write('base.md', 'resolved\n')
      await service.stage(root, ['base.md'])
      await expect(service.commitStaged(root, 'wrong sequencer')).rejects.toThrow('Use Continue')
      await service.continueOperation(root)
      expect(await service.operationState(root)).toEqual({ operation: null })
      expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('resolved\n')
    },
  )

  it('reverts normal commits and requires a valid mainline for merge commits', async () => {
    const { root, service, commit } = await createLocalFixture(roots)
    const change = await commit('added.md', 'added\n')
    await service.revert(root, change)
    await expect(fs.access(path.join(root, 'added.md'))).rejects.toThrow()
    await service.createBranch(root, 'feature')
    await service.switchBranch(root, 'feature')
    await commit('feature.md', 'feature\n')
    await service.switchBranch(root, 'main')
    await commit('main.md', 'main\n')
    await service.merge(root, 'feature')
    const merge = (await service.history(root))[0]!.hash
    await expect(service.revert(root, merge)).rejects.toThrow('mainline')
    await expect(service.revert(root, merge, 3)).rejects.toThrow('Invalid merge mainline')
    await service.revert(root, merge, 1)
    await expect(fs.access(path.join(root, 'feature.md'))).rejects.toThrow()
    expect(await fs.readFile(path.join(root, 'main.md'), 'utf8')).toBe('main\n')
  })

  it('continues and aborts revert conflicts', async () => {
    const { root, service, commit, write } = await createLocalFixture(roots)
    const change = await commit('base.md', 'version two\n')
    const head = await commit('base.md', 'version three\n')
    await expect(service.revert(root, change)).rejects.toThrow()
    expect(await service.operationState(root)).toEqual({ operation: 'revert' })
    await service.abortOperation(root)
    expect((await service.status(root)).repo.head).toBe(head)
    await expect(service.revert(root, change)).rejects.toThrow()
    await write('base.md', 'base\n')
    await service.stage(root, ['base.md'])
    await service.continueOperation(root)
    expect(await service.operationState(root)).toEqual({ operation: null })
  })

  it('retains stash entries and exposes conflicts when stash application fails', async () => {
    const { root, service, commit, write } = await createLocalFixture(roots)
    await write('base.md', 'stashed\n')
    await service.stashSave(root, 'conflicting stash')
    await commit('base.md', 'committed\n')
    const stashes = await service.stashList(root)
    expect((await service.status(root)).conflicts).toEqual([])
    await expect(service.stashApply(root, 'stash@{0}')).rejects.toThrow()
    expect((await service.status(root)).conflicts).toHaveLength(1)
    expect(await service.stashList(root)).toEqual(stashes)
    expect(await service.operationState(root)).toEqual({ operation: null })
  })

  it('blocks shell exec instructions in an externally initiated interactive rebase', async () => {
    const { root, service } = await createLocalFixture(roots)
    const marker = path.join(root, '.git', 'rebase-merge')
    await fs.mkdir(marker)
    await fs.writeFile(path.join(marker, 'git-rebase-todo'), 'exec touch forbidden\n')
    await expect(service.continueOperation(root)).rejects.toMatchObject({
      code: 'git_unsafe_configuration',
    })
    await expect(fs.access(path.join(root, 'forbidden'))).rejects.toThrow()
    expect(await gitTestCommand(root, ['status', '--porcelain'])).toBe('')
  })
})
