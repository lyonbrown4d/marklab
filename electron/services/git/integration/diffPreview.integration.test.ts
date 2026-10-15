import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  createLocalFixture,
  removeLocalFixtures,
} from '@electron/services/git/integration/localFixture'
import { gitTestCommand } from '@electron/services/git/testSupport'
import { MAX_GIT_PREVIEW_BYTES } from '@electron/services/git/textPreview'

const roots: string[] = []
afterEach(() => removeLocalFixtures(roots))

describe('Git text diff preview boundaries', { timeout: 30_000 }, () => {
  it('previews root commits, empty blobs, Unicode text, and missing deleted sides', async () => {
    const { root, service, commit } = await createLocalFixture(roots, false)
    const hash = await commit('text.md', '文字 🙂\n', 'Unicode root')
    expect(await service.commitDiff(root, hash, 'text.md')).toMatchObject({
      original_content: '',
      modified_content: '文字 🙂\n',
    })
    await commit('empty.md', '')
    await fs.unlink(path.join(root, 'text.md'))
    await service.stage(root, ['text.md'])
    await service.commitStaged(root, 'delete text')
    const deleted = (await service.history(root))[0]!.hash
    expect(await service.commitDiff(root, deleted, 'text.md')).toMatchObject({
      original_content: '文字 🙂\n',
      modified_content: '',
    })
    expect(await service.commitDiff(root, deleted, 'empty.md')).toMatchObject({
      original_content: '',
      modified_content: '',
    })
  })

  it('rejects oversized historical/index/worktree text while history metadata stays available', async () => {
    const { root, service, commit, write } = await createLocalFixture(roots)
    const hash = await commit('large.md', 'a'.repeat(MAX_GIT_PREVIEW_BYTES + 1), 'large text')
    await expect(service.commitDiff(root, hash, 'large.md')).rejects.toMatchObject({
      code: 'git_invalid_input',
      message: expect.stringContaining('1 MiB'),
    })
    expect((await service.history(root))[0]!.subject).toBe('large text')
    expect(await service.commitFiles(root, hash)).toEqual([{ path: 'large.md', status: 'A' }])
    await write('base.md', 'b'.repeat(MAX_GIT_PREVIEW_BYTES + 1))
    await expect(service.fileDiff(root, 'base.md', 'unstaged')).rejects.toThrow('1 MiB')
    await service.stage(root, ['base.md'])
    await expect(service.fileDiff(root, 'base.md', 'staged')).rejects.toThrow('1 MiB')
  })

  it.each([Buffer.from('binary\0content'), Buffer.from([0xff, 0xfe, 0xfd])])(
    'rejects NUL or invalid UTF-8 bytes without corrupting them into text',
    async (bytes) => {
      const { root, service } = await createLocalFixture(roots)
      await fs.writeFile(path.join(root, 'binary.bin'), bytes)
      await expect(service.fileDiff(root, 'binary.bin', 'untracked')).rejects.toThrow(
        'binary or non-UTF-8',
      )
      await service.stage(root, ['binary.bin'])
      await expect(service.fileDiff(root, 'binary.bin', 'staged')).rejects.toThrow(
        'binary or non-UTF-8',
      )
      await service.commitStaged(root, 'binary commit')
      const hash = (await service.history(root))[0]!.hash
      await expect(service.commitDiff(root, hash, 'binary.bin')).rejects.toThrow(
        'binary or non-UTF-8',
      )
      expect(await service.commitFiles(root, hash)).toEqual([{ path: 'binary.bin', status: 'A' }])
    },
  )

  it('surfaces a corrupt referenced blob instead of reporting an empty historical side', async () => {
    const { root, service, commit } = await createLocalFixture(roots)
    const hash = await commit('corrupt.md', 'corrupt target\n')
    const blob = (await gitTestCommand(root, ['rev-parse', `${hash}:corrupt.md`])).trim()
    await fs.unlink(path.join(root, '.git', 'objects', blob.slice(0, 2), blob.slice(2)))
    await expect(service.commitDiff(root, hash, 'corrupt.md')).rejects.toMatchObject({
      code: 'git_command_failed',
    })
  })
})
