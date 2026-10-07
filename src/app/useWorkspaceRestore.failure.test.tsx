import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceRestore } from '@/app/useWorkspaceRestore'

const mocks = vi.hoisted(() => ({
  flushEditorChanges: vi.fn(),
  setRoot: vi.fn(),
}))

vi.mock('@/app/editorCloseLifecycle', () => ({
  flushEditorChanges: mocks.flushEditorChanges,
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/fsApi', () => ({
  fsApi: { setRoot: mocks.setRoot, setSingleFile: vi.fn() },
}))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: vi.fn(() => vi.fn()) },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

describe('workspace restore failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.flushEditorChanges.mockResolvedValue(undefined)
    mocks.setRoot.mockResolvedValue({ kind: 'external', path: '/workspace' })
  })

  it('does not load or mark restored after the editor flush fails', async () => {
    mocks.flushEditorChanges.mockRejectedValueOnce(new Error('save failed'))
    const loadWorkspace = vi.fn(async () => undefined)
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )

    await waitFor(() => expect(mocks.flushEditorChanges).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.isRestoringSession).toBe(false))
    expect(result.current.restoreStatusMessage).toBe('app.restoreRootFailed')
    expect(result.current.isSessionRestored).toBe(false)
    expect(mocks.setRoot).not.toHaveBeenCalled()
    expect(loadWorkspace).not.toHaveBeenCalled()
  })

  it('does not load or mark restored after setting the root fails', async () => {
    mocks.setRoot.mockRejectedValueOnce(new Error('root unavailable'))
    const loadWorkspace = vi.fn(async () => undefined)
    const { result } = renderHook(() =>
      useWorkspaceRestore({
        hasHydrated: true,
        loadWorkspace,
        rootKind: 'external',
        rootPath: '/workspace',
      }),
    )

    await waitFor(() => expect(mocks.setRoot).toHaveBeenCalledOnce())
    await waitFor(() => expect(result.current.isRestoringSession).toBe(false))
    expect(result.current.restoreStatusMessage).toBe('app.restoreRootFailed')
    expect(result.current.isSessionRestored).toBe(false)
    expect(loadWorkspace).not.toHaveBeenCalled()
  })
})
