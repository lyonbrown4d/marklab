import { gitConflictSnapshotSchema } from '@/types/gitConflicts'
import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runGit } from '@electron/services/git/helpers'
import { createConflictFixture } from '@electron/services/git/integration/conflictFixture'
import {
  createLocalFixture,
  removeLocalFixtures,
} from '@electron/services/git/integration/localFixture'
import { gitTestCommand } from '@electron/services/git/testSupport'

const roots: string[] = []
afterEach(() => removeLocalFixtures(roots))

describe('Git editable conflict snapshots and selected saves', { timeout: 30_000 }, () => {
  it('reads true index versions, saves manually without staging, and stages only the resolved selected file', async () => {
    const { root, service, write, file } = await createConflictFixture(roots)
    const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    expect(view).toMatchObject({
      path: file,
      base: 'base\n',
      ours: 'current\n',
      theirs: 'incoming\n',
      deleted: false,
      markerSize: 7,
    })
    expect(view.result).toContain('<<<<<<< HEAD')
    expect(view.revision).toMatch(/^[a-f0-9]{64}$/)
    await write('independent.md', 'independent staged content\n')
    await service.stage(root, ['independent.md'])
    const saved = await service.saveConflict(root, {
      path: file,
      content: 'current\nincoming\n',
      revision: view.revision,
    })
    expect(saved.staged).toBe(false)
    expect(saved.status.conflicts).toHaveLength(1)
    expect(saved.status.staged.map((change) => change.path)).toEqual(['independent.md'])
    expect(await fs.readFile(path.join(root, file), 'utf8')).toBe('current\nincoming\n')
    const edited = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    expect(edited.revision).toBe(saved.revision)
    expect(edited.revision).not.toBe(view.revision)
    const staged = await service.saveConflict(root, {
      path: file,
      content: edited.result,
      revision: edited.revision,
      stage: true,
    })
    expect(staged.staged).toBe(true)
    expect(staged.revision).toBe(edited.revision)
    expect(staged.status.conflicts).toEqual([])
    expect(staged.status.staged.map((change) => change.path)).toEqual([file, 'independent.md'])
    expect(await gitTestCommand(root, ['show', ':independent.md'])).toBe(
      'independent staged content\n',
    )
    await expect(service.conflict(root, file)).rejects.toThrow('no longer an unresolved')
  })

  it.each(['base', 'ours', 'theirs'] as const)(
    'saves a complete %s version as an explicitly staged resolution',
    async (side) => {
      const { root, service, file } = await createConflictFixture(roots)
      const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
      const content = view[side]!
      const result = await service.saveConflict(root, {
        path: file,
        content,
        revision: view.revision,
        stage: true,
      })
      expect(result.status.conflicts).toEqual([])
      expect(await fs.readFile(path.join(root, file), 'utf8')).toBe(content)
      expect(await gitTestCommand(root, ['show', `:${file}`])).toBe(content)
    },
  )

  it('rejects an external result edit without overwriting it and refreshes after the failed mutation', async () => {
    const { root, service, write, file } = await createConflictFixture(roots)
    const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    await write(file, 'external result\n')
    await expect(
      service.saveConflict(root, {
        path: file,
        content: 'editor overwrite\n',
        revision: view.revision,
        stage: true,
      }),
    ).rejects.toThrow('Conflict changed outside')
    expect(await fs.readFile(path.join(root, file), 'utf8')).toBe('external result\n')
    const current = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    expect(current.result).toBe('external result\n')
    expect(current.revision).not.toBe(view.revision)
  })

  it('includes index modes and hashes in the revision and rejects an external stage change', async () => {
    const { root, service, file } = await createConflictFixture(roots)
    const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    const ours = (await gitTestCommand(root, ['rev-parse', `:2:${file}`])).trim()
    await runGit(root, ['update-index', '--index-info'], { input: `100755 ${ours} 2\t${file}\n` })
    await expect(
      service.saveConflict(root, { path: file, content: 'overwrite\n', revision: view.revision }),
    ).rejects.toThrow('Conflict changed outside')
    expect(await fs.readFile(path.join(root, file), 'utf8')).toBe(view.result)
    const current = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    expect(current.ours).toBe(view.ours)
    expect(current.revision).not.toBe(view.revision)
  })

  it.each(['merge', 'diff3', 'zdiff3'] as const)(
    'allows saving %s markers but refuses staging them',
    async (style) => {
      const { root, service, file } = await createConflictFixture(roots, { style })
      const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
      await service.saveConflict(root, {
        path: file,
        content: view.result,
        revision: view.revision,
      })
      await expect(
        service.saveConflict(root, {
          path: file,
          content: view.result,
          revision: view.revision,
          stage: true,
        }),
      ).rejects.toMatchObject({ code: 'git_conflicts_present' })
      expect(await fs.readFile(path.join(root, file), 'utf8')).toBe(view.result)
      expect((await service.status(root)).conflicts).toHaveLength(1)
    },
  )

  it('honors custom conflict marker widths from Git attributes', async () => {
    const { root, service, file } = await createConflictFixture(roots, { markerSize: 3 })
    const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    expect(view.result).toContain('<<< HEAD')
    expect(view.markerSize).toBe(3)
    await expect(
      service.saveConflict(root, {
        path: file,
        content: view.result,
        revision: view.revision,
        stage: true,
      }),
    ).rejects.toMatchObject({ code: 'git_conflicts_present' })
  })

  it('guards marker configuration changes and still rejects the earlier narrower conflict block after refresh', async () => {
    const { root, service, file, write } = await createConflictFixture(roots, { markerSize: 3 })
    const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    await write('.gitattributes', `${file} conflict-marker-size=5\n`)
    await expect(
      service.saveConflict(root, {
        path: file,
        content: 'resolved\n',
        revision: view.revision,
        stage: true,
      }),
    ).rejects.toThrow('Conflict changed outside')
    const refreshed = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    expect(refreshed.markerSize).toBe(5)
    expect(refreshed.revision).not.toBe(view.revision)
    await expect(
      service.saveConflict(root, {
        path: file,
        content: refreshed.result,
        revision: refreshed.revision,
        stage: true,
      }),
    ).rejects.toMatchObject({ code: 'git_conflicts_present' })
    expect(await fs.readFile(path.join(root, file), 'utf8')).toBe(view.result)
  })

  it('restores a selected missing file and its missing parent directories without staging', async () => {
    const { root, service, file } = await createConflictFixture(roots, {
      file: 'nested/selected.md',
    })
    await fs.rm(path.join(root, 'nested'), { recursive: true })
    const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    expect(view.deleted).toBe(true)
    const saved = await service.saveConflict(root, {
      path: file,
      content: view.theirs!,
      revision: view.revision,
    })
    expect(saved.staged).toBe(false)
    expect(await fs.readFile(path.join(root, file), 'utf8')).toBe('incoming\n')
    expect(gitConflictSnapshotSchema.parse(await service.conflict(root, file)).deleted).toBe(false)
  })

  it('restores the preferred executable index mode when creating a missing conflict result', async () => {
    const { root, service, file } = await createConflictFixture(roots)
    const ours = (await gitTestCommand(root, ['rev-parse', `:2:${file}`])).trim()
    await runGit(root, ['update-index', '--index-info'], { input: `100755 ${ours} 2\t${file}\n` })
    await fs.unlink(path.join(root, file))
    const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
    expect(view.deleted).toBe(true)
    const saved = await service.saveConflict(root, {
      path: file,
      content: view.ours!,
      revision: view.revision,
      stage: true,
    })
    expect(saved.status.conflicts).toEqual([])
    expect(await gitTestCommand(root, ['ls-files', '--stage', '--', file])).toMatch(/^100755 /)
    if (process.platform !== 'win32')
      expect((await fs.stat(path.join(root, file))).mode & 0o100).toBe(0o100)
  })

  it.each([{ oursDeleted: true }, { theirsDeleted: true }])(
    'supports modify/delete null sides and explicit deletion: %o',
    async (options) => {
      const { root, service, file } = await createConflictFixture(roots, options)
      const view = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
      expect(view.base).toBe('base\n')
      expect(options.oursDeleted ? view.ours : view.theirs).toBeNull()
      const deleted = await service.saveConflict(root, {
        path: file,
        content: '',
        revision: view.revision,
        deleteFile: true,
      })
      expect(deleted.staged).toBe(false)
      await expect(fs.access(path.join(root, file))).rejects.toThrow()
      const refreshed = gitConflictSnapshotSchema.parse(await service.conflict(root, file))
      expect(refreshed).toMatchObject({ deleted: true, result: '', revision: deleted.revision })
      const staged = await service.saveConflict(root, {
        path: file,
        content: '',
        revision: refreshed.revision,
        deleteFile: true,
        stage: true,
      })
      expect(staged).toMatchObject({ staged: true, status: { conflicts: [] } })
    },
  )

  it('preserves null base for add/add conflicts and distinguishes an empty file from a deleted result', async () => {
    const { root, service, commit } = await createLocalFixture(roots)
    await service.createBranch(root, 'incoming')
    await service.switchBranch(root, 'incoming')
    await commit('added.md', 'incoming\n')
    await service.switchBranch(root, 'main')
    await commit('added.md', 'current\n')
    await expect(service.merge(root, 'incoming')).rejects.toThrow()
    const view = gitConflictSnapshotSchema.parse(await service.conflict(root, 'added.md'))
    expect(view).toMatchObject({ base: null, ours: 'current\n', theirs: 'incoming\n' })
    await service.saveConflict(root, { path: 'added.md', content: '', revision: view.revision })
    expect(await service.conflict(root, 'added.md')).toMatchObject({ result: '', deleted: false })
  })
})
