import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ runGit: vi.fn(), runGitBlobBuffer: vi.fn() }))
vi.mock('@electron/services/git/helpers', () => mocks)

import { readGitTextBlob } from '@electron/services/git/blobPreview'
import { MAX_GIT_PREVIEW_BYTES } from '@electron/services/git/textPreview'

const commit = 'a'.repeat(40)
const blob = 'b'.repeat(40)

describe('Git blob preview preflight', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.runGitBlobBuffer.mockResolvedValue(Buffer.from('text\n'))
  })

  it('rejects an oversized blob before retrieving its content', async () => {
    mocks.runGit
      .mockResolvedValueOnce({ stdout: `100644 blob ${blob}\tlarge.md\0`, stderr: '' })
      .mockResolvedValueOnce({ stdout: `${blob} blob ${MAX_GIT_PREVIEW_BYTES + 1}\n`, stderr: '' })
    await expect(readGitTextBlob('/repo', commit, 'large.md')).rejects.toThrow('1 MiB')
    expect(mocks.runGitBlobBuffer).not.toHaveBeenCalled()
  })

  it('distinguishes an absent tree entry from a failed Git command', async () => {
    mocks.runGit.mockResolvedValueOnce({ stdout: '', stderr: '' })
    expect(await readGitTextBlob('/repo', commit, 'missing.md')).toBeNull()
    mocks.runGit.mockRejectedValueOnce(new Error('cannot read tree object'))
    await expect(readGitTextBlob('/repo', commit, 'missing.md')).rejects.toThrow(
      'cannot read tree object',
    )
    expect(mocks.runGitBlobBuffer).not.toHaveBeenCalled()
  })

  it('rejects a non-blob object before retrieving its content', async () => {
    mocks.runGit
      .mockResolvedValueOnce({ stdout: `160000 ${blob} 0\tmodule\0`, stderr: '' })
      .mockResolvedValueOnce({ stdout: `${blob} commit 200\n`, stderr: '' })
    await expect(readGitTextBlob('/repo', null, 'module')).rejects.toThrow('regular Git file blob')
    expect(mocks.runGitBlobBuffer).not.toHaveBeenCalled()
  })
})
