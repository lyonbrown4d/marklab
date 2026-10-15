import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { runGit } from '@electron/services/git/helpers'
import { createConflictFixture } from '@electron/services/git/integration/conflictFixture'
import { removeLocalFixtures } from '@electron/services/git/integration/localFixture'
import { gitTestCommand } from '@electron/services/git/testSupport'
import { MAX_GIT_PREVIEW_BYTES } from '@electron/services/git/textPreview'

const roots: string[] = []
afterEach(() => removeLocalFixtures(roots))

describe('Git conflict editing text and filesystem boundaries', { timeout: 30_000 }, () => {
  it('refuses invalid or unbounded marker-width attributes before exposing or saving a conflict', async () => {
    const { root, service, file, write } = await createConflictFixture(roots)
    const view = await service.conflict(root, file)
    for (const width of ['0', '-1', '1025', '999999999999999999', 'not-a-number']) {
      await write('.gitattributes', `${file} conflict-marker-size=${width}\n`)
      await expect(
        service.saveConflict(root, { path: file, content: 'resolved\n', revision: view.revision }),
      ).rejects.toThrow('between 1 and 1024')
      await expect(service.conflict(root, file)).rejects.toThrow('between 1 and 1024')
    }
    expect(await fs.readFile(path.join(root, file), 'utf8')).toBe(view.result)
  })
  it('refuses invalid requests and oversized/non-text results before changing files', async () => {
    const { root, service, file } = await createConflictFixture(roots)
    const view = await service.conflict(root, file)
    for (const content of [
      'a'.repeat(MAX_GIT_PREVIEW_BYTES + 1),
      '文'.repeat(MAX_GIT_PREVIEW_BYTES / 2),
      'NUL\0text',
      '\uD800',
    ]) {
      await expect(
        service.saveConflict(root, { path: file, content, revision: view.revision }),
      ).rejects.toMatchObject({ code: 'git_invalid_input' })
      expect(await fs.readFile(path.join(root, file), 'utf8')).toBe(view.result)
    }
    for (const request of [
      null,
      { path: file, content: 'text', revision: 'HEAD' },
      { path: file, content: 'text', revision: view.revision, stage: 'true' },
      { path: file, content: 'not empty', revision: view.revision, deleteFile: true },
      { path: file, content: 'text', revision: view.revision, extra: true },
    ]) {
      await expect(service.saveConflict(root, request)).rejects.toMatchObject({
        code: 'git_invalid_input',
      })
    }
    expect(await fs.readFile(path.join(root, file), 'utf8')).toBe(view.result)
  })

  it.each([Buffer.from('binary\0stage'), Buffer.alloc(MAX_GIT_PREVIEW_BYTES + 1, 'x')])(
    'rejects binary or large index versions using the bounded blob reader',
    async (bytes) => {
      const { root, service, file } = await createConflictFixture(roots)
      const fixturePath = path.join(root, 'unsafe-stage.fixture')
      await fs.writeFile(fixturePath, bytes)
      const hash = (await gitTestCommand(root, ['hash-object', '-w', fixturePath])).trim()
      await runGit(root, ['update-index', '--index-info'], { input: `100644 ${hash} 3\t${file}\n` })
      await expect(service.conflict(root, file)).rejects.toMatchObject({
        code: 'git_invalid_input',
      })
    },
  )

  it.each(['120000', '160000'])(
    'rejects unsafe index mode %s even when the worktree result is regular',
    async (mode) => {
      const { root, service, file } = await createConflictFixture(roots)
      const hash = (
        await gitTestCommand(root, ['rev-parse', mode === '160000' ? 'HEAD' : `:3:${file}`])
      ).trim()
      await runGit(root, ['update-index', '--index-info'], {
        input: `${mode} ${hash} 3\t${file}\n`,
      })
      await expect(service.conflict(root, file)).rejects.toMatchObject({
        code: 'git_workspace_boundary',
      })
    },
  )

  it('refuses non-conflicts, metadata, traversal, directory replacements and escaping symlinks', async () => {
    const { root, service, file } = await createConflictFixture(roots)
    const view = await service.conflict(root, file)
    for (const unsafe of ['.git/config', '../outside.md', 'nested/../base.md', '/tmp/outside.md']) {
      await expect(service.conflict(root, unsafe)).rejects.toThrow()
      await expect(
        service.saveConflict(root, { path: unsafe, content: 'unsafe', revision: view.revision }),
      ).rejects.toThrow()
    }
    await expect(service.conflict(root, 'not-conflicted.md')).rejects.toThrow(
      'no longer an unresolved',
    )
    await fs.unlink(path.join(root, file))
    await fs.mkdir(path.join(root, file))
    await expect(
      service.saveConflict(root, { path: file, content: 'unsafe', revision: view.revision }),
    ).rejects.toThrow('directory')
    await fs.rmdir(path.join(root, file))
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'marklab-conflict-outside-'))
    roots.push(outside)
    const target = path.join(outside, 'secret.md')
    await fs.writeFile(target, 'outside content\n')
    await fs.symlink(target, path.join(root, file), 'file')
    await expect(
      service.saveConflict(root, { path: file, content: 'overwrite', revision: view.revision }),
    ).rejects.toThrow('symlink')
    expect(await fs.readFile(target, 'utf8')).toBe('outside content\n')
  })

  it('treats pathspec-looking conflict names literally', async () => {
    if (process.platform === 'win32') return // Windows disallows colon components.
    const { root, service, file } = await createConflictFixture(roots, {
      file: ':(glob)selected.md',
    })
    const view = await service.conflict(root, file)
    const resolved = await service.saveConflict(root, {
      path: file,
      content: view.theirs!,
      revision: view.revision,
      stage: true,
    })
    expect(resolved.status.conflicts).toEqual([])
    expect(await fs.readFile(path.join(root, 'base.md'), 'utf8')).toBe('base\n')
  })

  it('rejects symlink ancestors before saving a conflict', async () => {
    const nested = await createConflictFixture(roots, { file: 'nested/selected.md' })
    const nestedView = await nested.service.conflict(nested.root, nested.file)
    const moved = path.join(nested.root, 'original-directory')
    await fs.rename(path.join(nested.root, 'nested'), moved)
    await fs.symlink(moved, path.join(nested.root, 'nested'), 'dir')
    await expect(
      nested.service.saveConflict(nested.root, {
        path: nested.file,
        content: 'unsafe',
        revision: nestedView.revision,
      }),
    ).rejects.toThrow('symlink')
  })
})
