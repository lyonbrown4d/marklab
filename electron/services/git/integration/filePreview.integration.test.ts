import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLocalFixture,
  removeLocalFixtures,
} from '@electron/services/git/integration/localFixture'
import { WorkspaceGitPreviewFiles } from '@electron/services/workspace/workspaceGitPreviewFiles'
import { parseWorkspaceAssetCapabilityUrl } from '@electron/services/workspace/workspaceAssetCapabilities'
import { gitTestCommand } from '@electron/services/git/testSupport'

const roots: string[] = []
const stores: WorkspaceGitPreviewFiles[] = []
afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.dispose()))
  await removeLocalFixtures(roots)
})
const createStore = () => {
  const shell = { openPath: vi.fn<(file: string) => Promise<string>>().mockResolvedValue('') }
  const store = new WorkspaceGitPreviewFiles(shell)
  stores.push(store)
  return { store, shell }
}
describe('Git file version opening', { timeout: 30_000 }, () => {
  it('serves the staged binary version even after the worktree changes, and revokes its capability on disposal', async () => {
    const { root, service } = await createLocalFixture(roots)
    const file = path.join(root, 'cover.png')
    const staged = Buffer.from('staged\0image')
    await fs.writeFile(file, staged)
    await service.stage(root, ['cover.png'])
    await fs.writeFile(file, Buffer.from('different\0worktree'))
    const source = await service.filePreviewSource(root, {
      path: 'cover.png',
      section: 'staged',
      action: 'preview',
    })
    expect(source.kind).toBe('blob')
    if (source.kind !== 'blob') throw new Error('Expected an index blob')
    const { store, shell } = createStore()
    const result = await store.open(source, 'preview')
    expect(result.kind).toBe('preview')
    if (result.kind !== 'preview') throw new Error('Expected an opaque asset URL')
    expect(result).toMatchObject({ label: 'Index', readonly: true, snapshot: true })
    const token = parseWorkspaceAssetCapabilityUrl(result.url)!
    const asset = await store.resolveToken(token)
    const bytes = Buffer.alloc(1024)
    const count = await asset!.readChunk(bytes, 0)
    await asset!.close()
    expect(bytes.subarray(0, count)).toEqual(staged)
    expect(shell.openPath).not.toHaveBeenCalled()
    await store.open(source, 'system')
    const snapshot = shell.openPath.mock.calls[0]![0]
    expect(await fs.readFile(snapshot)).toEqual(staged)
    expect((await fs.stat(snapshot)).mode & 0o222).toBe(0)
    expect(await fs.readFile(file)).toEqual(Buffer.from('different\0worktree'))
    await store.dispose()
    expect(await store.resolveToken(token)).toBeNull()
    await expect(fs.stat(snapshot)).rejects.toMatchObject({ code: 'ENOENT' })
  })
  it('removes idle snapshots before opening another version', async () => {
    const { root, service } = await createLocalFixture(roots)
    await fs.writeFile(path.join(root, 'idle.bin'), Buffer.from('old\0bytes'))
    await service.stage(root, ['idle.bin'])
    const source = await service.filePreviewSource(root, {
      path: 'idle.bin',
      section: 'staged',
      action: 'system',
    })
    if (source.kind !== 'blob') throw new Error('Expected a snapshot')
    const { store, shell } = createStore()
    await store.open(source, 'system')
    const oldPath = shell.openPath.mock.calls[0]![0]
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 31 * 60_000)
    try {
      await store.open(source, 'system')
      const newPath = shell.openPath.mock.calls[1]![0]
      expect(newPath).not.toBe(oldPath)
      await expect(fs.stat(oldPath)).rejects.toMatchObject({ code: 'ENOENT' })
      expect(await fs.readFile(newPath)).toEqual(Buffer.from('old\0bytes'))
    } finally {
      clock.mockRestore()
    }
  })

  it('opens the selected commit, and uses its parent for a deleted historical file', async () => {
    const { root, service } = await createLocalFixture(roots)
    const file = path.join(root, 'note.pdf')
    const original = Buffer.from('original\0pdf')
    await fs.writeFile(file, original)
    await service.stage(root, ['note.pdf'])
    await service.commitStaged(root, 'Add PDF')
    const commit = (await gitTestCommand(root, ['rev-parse', 'HEAD'])).trim()
    await fs.unlink(file)
    await service.stage(root, ['note.pdf'])
    await service.commitStaged(root, 'Delete PDF')
    const deleted = (await gitTestCommand(root, ['rev-parse', 'HEAD'])).trim()
    const source = await service.filePreviewSource(root, {
      path: 'note.pdf',
      commit: deleted,
      action: 'system',
    })
    const selected = await service.filePreviewSource(root, {
      path: 'note.pdf',
      commit,
      action: 'preview',
    })
    expect(source).toEqual(selected)
    if (source.kind !== 'blob') throw new Error('Expected the deleted file version')
    const { store, shell } = createStore()
    await store.open(source, 'system')
    expect(await fs.readFile(shell.openPath.mock.calls[0]![0])).toEqual(original)
    expect(await service.status(root)).toMatchObject({ staged: [], unstaged: [], untracked: [] })
  })
  it('streams large snapshots and propagates default-application failures', async () => {
    const { root, service } = await createLocalFixture(roots)
    const bytes = Buffer.alloc(3 * 1024 * 1024, 0xab)
    await fs.writeFile(path.join(root, 'large.zip'), bytes)
    await service.stage(root, ['large.zip'])
    const source = await service.filePreviewSource(root, {
      path: 'large.zip',
      section: 'staged',
      action: 'system',
    })
    if (source.kind !== 'blob') throw new Error('Expected an index blob')
    const { store, shell } = createStore()
    shell.openPath.mockResolvedValueOnce('No application registered')
    await expect(store.open(source, 'system')).rejects.toThrow('No application registered')
    expect(await fs.readFile(shell.openPath.mock.calls[0]![0])).toEqual(bytes)
  })
  it('keeps live versions editable and refuses traversal, symbolic links and invalid revisions', async () => {
    const { root, service } = await createLocalFixture(roots)
    expect(
      await service.filePreviewSource(root, {
        path: 'base.md',
        section: 'unstaged',
        action: 'preview',
      }),
    ).toMatchObject({
      kind: 'worktree',
      absolutePath: path.join(await fs.realpath(root), 'base.md'),
    })
    for (const file of ['../outside.png', '.git/config', 'a/../base.md']) {
      await expect(
        service.filePreviewSource(root, { path: file, action: 'system' }),
      ).rejects.toThrow()
    }
    await expect(
      service.filePreviewSource(root, {
        path: 'base.md',
        commit: 'HEAD;echo unsafe',
        action: 'system',
      }),
    ).rejects.toThrow()
    await fs.symlink(path.join(root, 'base.md'), path.join(root, 'linked.png'))
    await expect(
      service.filePreviewSource(root, { path: 'linked.png', action: 'system' }),
    ).rejects.toThrow('symlink')
  })
})
