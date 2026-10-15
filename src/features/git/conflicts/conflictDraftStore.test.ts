import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushEditorChangesForClose } from '@/app/editorCloseLifecycle'
import {
  approveGitConflictClose,
  assertGitConflictDraftsSaved,
  cancelGitConflictClose,
  discardGitConflictDraft,
  hasGitConflictDraft,
  readGitConflictDraft,
  registerGitConflictCloseHandler,
  registerGitConflictSaveHandler,
  requestGitConflictClose,
  saveMountedGitConflictDraft,
  storeGitConflictDraft,
} from '@/features/git/conflicts/conflictDraftStore'

beforeEach(() => {
  for (const path of ['file.ts', 'other.ts']) {
    discardGitConflictDraft('/store', path)
    cancelGitConflictClose('/store', path)
  }
})
const draft = {
  content: 'manual();',
  revision: 'a'.repeat(64),
  deleteFile: false,
  deletionConfirmed: false,
}

describe('Git conflict draft ownership', () => {
  it('stores only dirty primitive fields and protects native/workspace closes until all drafts are saved', async () => {
    storeGitConflictDraft(
      '/store',
      'file.ts',
      { ...draft, snapshot: 'must not retain' } as typeof draft,
      'Resolve unsaved drafts',
    )
    storeGitConflictDraft('/store', 'other.ts', draft, 'Resolve unsaved drafts')
    expect(Object.keys(readGitConflictDraft('/store', 'file.ts')!).sort()).toEqual([
      'content',
      'deleteFile',
      'deletionConfirmed',
      'revision',
    ])
    expect(hasGitConflictDraft('/store', 'file.ts')).toBe(true)
    expect(() => assertGitConflictDraftsSaved()).toThrow('Resolve unsaved drafts')
    await expect(flushEditorChangesForClose()).rejects.toThrow('Resolve unsaved drafts')
    discardGitConflictDraft('/store', 'file.ts')
    await expect(flushEditorChangesForClose()).rejects.toThrow('Resolve unsaved drafts')
    discardGitConflictDraft('/store', 'other.ts')
    await expect(flushEditorChangesForClose()).resolves.toBeUndefined()
  })

  it('queues inactive-tab closure until the mounted view registers and cancels without approving', () => {
    const approve = vi.fn()
    const show = vi.fn()
    expect(requestGitConflictClose('/store', 'file.ts', approve)).toBe(false)
    storeGitConflictDraft('/store', 'file.ts', draft, 'Unsaved')
    expect(requestGitConflictClose('/store', 'file.ts', approve)).toBe(true)
    const unregister = registerGitConflictCloseHandler('/store', 'file.ts', show)
    expect(show).toHaveBeenCalledOnce()
    cancelGitConflictClose('/store', 'file.ts')
    expect(approveGitConflictClose('/store', 'file.ts')).toBe(false)
    expect(approve).not.toHaveBeenCalled()
    unregister()
  })

  it('approves a queued close exactly once and routes native Save only to the mounted owner', async () => {
    storeGitConflictDraft('/store', 'file.ts', draft, 'Unsaved')
    const approve = vi.fn()
    const show = vi.fn()
    const unregister = registerGitConflictCloseHandler('/store', 'file.ts', show)
    expect(requestGitConflictClose('/store', 'file.ts', approve)).toBe(true)
    expect(show).toHaveBeenCalledOnce()
    discardGitConflictDraft('/store', 'file.ts')
    expect(approveGitConflictClose('/store', 'file.ts')).toBe(true)
    expect(approveGitConflictClose('/store', 'file.ts')).toBe(false)
    expect(approve).toHaveBeenCalledOnce()
    const save = vi.fn().mockResolvedValue(true)
    const remove = registerGitConflictSaveHandler('/store', 'file.ts', save)
    await expect(saveMountedGitConflictDraft('/store', 'file.ts')).resolves.toBe(true)
    await expect(saveMountedGitConflictDraft('/different', 'file.ts')).resolves.toBe(false)
    remove()
    await expect(saveMountedGitConflictDraft('/store', 'file.ts')).resolves.toBe(false)
    unregister()
  })
})
