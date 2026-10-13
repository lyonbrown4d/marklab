import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCreateWorkspace } from '@/app/useCreateWorkspace'
import { createWorkspaceDialog } from '@/runtime/dialog'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'
import { toast } from 'sonner'
vi.mock('@/runtime/dialog', () => ({ createWorkspaceDialog: vi.fn() }))
vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn() }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(flushEditorChanges).mockResolvedValue(undefined)
})
const setup = () => {
  const openFolder = vi.fn(async () => true)
  const { result } = renderHook(() => useCreateWorkspace(openFolder, { current: false }))
  return { result, openFolder }
}
describe('new workspace flow', () => {
  it('flushes before creation and opens only the created path', async () => {
    vi.mocked(createWorkspaceDialog).mockResolvedValue('/parent/new')
    const { result, openFolder } = setup()
    await expect(result.current('new')).resolves.toBe(true)
    expect(createWorkspaceDialog).toHaveBeenCalledWith({
      name: 'new',
      title: 'dialog.selectWorkspaceParent',
    })
    expect(vi.mocked(flushEditorChanges).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(createWorkspaceDialog).mock.invocationCallOrder[0],
    )
    expect(openFolder).toHaveBeenCalledWith('/parent/new')
  })
  it('keeps the current root after parent picker cancellation', async () => {
    vi.mocked(createWorkspaceDialog).mockResolvedValue(null)
    const { result, openFolder } = setup()
    await expect(result.current('new')).resolves.toBe(false)
    expect(openFolder).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
  it.each(['flush', 'creation'])('does not switch when %s fails', async (stage) => {
    if (stage === 'flush')
      vi.mocked(flushEditorChanges).mockRejectedValue(new Error('dirty save failed'))
    else vi.mocked(createWorkspaceDialog).mockRejectedValue(new Error('already exists'))
    const { result, openFolder } = setup()
    await expect(result.current('new')).resolves.toBe(false)
    expect(openFolder).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
  })
  it('guards duplicate creation while the picker is pending', async () => {
    let finish: (path: string | null) => void = () => undefined
    vi.mocked(createWorkspaceDialog).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    const { result } = setup()
    const first = result.current('new')
    await expect(result.current('duplicate')).resolves.toBe(false)
    await vi.waitFor(() => expect(createWorkspaceDialog).toHaveBeenCalledOnce())
    finish(null)
    await act(async () => {
      await first
    })
  })
  it('awaits the restore barrier before flushing or creating and unlocks after cancellation', async () => {
    let finish: () => void = () => undefined
    const rootSwitchingRef = { current: false }
    const barrier = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const openFolder = vi.fn(async () => true)
    vi.mocked(createWorkspaceDialog).mockResolvedValue(null)
    const { result } = renderHook(() => useCreateWorkspace(openFolder, rootSwitchingRef, barrier))
    const opening = result.current('Notes')
    expect(rootSwitchingRef.current).toBe(true)
    expect(flushEditorChanges).not.toHaveBeenCalled()
    expect(createWorkspaceDialog).not.toHaveBeenCalled()
    finish()
    await act(async () => {
      expect(await opening).toBe(false)
    })
    expect(rootSwitchingRef.current).toBe(false)
    expect(openFolder).not.toHaveBeenCalled()
  })
})
