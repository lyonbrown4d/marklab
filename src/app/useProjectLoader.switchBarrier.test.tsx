import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectLoader } from '@/app/useProjectLoader'
import { fsApi } from '@/services/fsApi'
import { flushEditorChanges } from '@/app/editorCloseLifecycle'

vi.mock('@/app/editorCloseLifecycle', () => ({ flushEditorChanges: vi.fn() }))
vi.mock('@/runtime/environment', () => ({
  runInDesktop: (callback: () => unknown) => Promise.resolve(callback()),
}))
vi.mock('@/services/fsApi', () => ({ fsApi: { setRoot: vi.fn(), setSingleFile: vi.fn() } }))
vi.mock('@/app/projectLoaderUtils', async (original) => ({
  ...(await original<typeof import('@/app/projectLoaderUtils')>()),
  fetchWorkspaceLoadProjection: vi.fn(async () => ({
    generation: 1,
    revision: 1,
    nextCursor: null,
    snapshot: { entries: [], root: { path: '/next', kind: 'external' } },
  })),
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
beforeEach(() => vi.clearAllMocks())
const setup = (onBeforeWorkspaceOpen: () => Promise<void>) => {
  const rootSwitchingRef = { current: false }
  const { result } = renderHook(() =>
    useProjectLoader({
      onBeforeWorkspaceOpen,
      rootSwitchingRef,
      rootPath: '/old',
      rootKind: 'external',
      entries: [],
      tabs: [],
      activeTabId: null,
      locationPathname: '/',
      preserveCurrentRoute: false,
      defaultFileView: 'edit',
      navigate: vi.fn(),
      setEntries: vi.fn(),
      setRootPath: vi.fn(),
      setRootKind: vi.fn(),
      setTabs: vi.fn(),
      setActiveTabId: vi.fn(),
      touchRecentProject: vi.fn(),
    }),
  )
  return { result, rootSwitchingRef }
}
describe('current-window switch restore barrier', () => {
  it.each(['path', 'default'])(
    'waits before switching %s, then releases the shared guard',
    async (kind) => {
      let finish: () => void = () => undefined
      const barrier = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
      const { result, rootSwitchingRef } = setup(barrier)
      const opening =
        kind === 'path' ? result.current.openFolder('/next') : result.current.onUseInternalRoot()
      await vi.waitFor(() => expect(barrier).toHaveBeenCalledOnce())
      expect(rootSwitchingRef.current).toBe(true)
      expect(fsApi.setRoot).not.toHaveBeenCalled()
      expect(flushEditorChanges).not.toHaveBeenCalled()
      expect(await result.current.openFolder('/duplicate')).toBe(false)
      finish()
      await act(async () => {
        expect(await opening).toBe(true)
      })
      expect(fsApi.setRoot).toHaveBeenCalledWith(kind === 'path' ? '/next' : null)
      expect(rootSwitchingRef.current).toBe(false)
    },
  )
  it.each(['path', 'default'])(
    'does not mutate %s root and unlocks when the barrier fails',
    async (kind) => {
      const { result, rootSwitchingRef } = setup(async () => {
        throw new Error('restore failed')
      })
      await act(async () => {
        const opened =
          kind === 'path'
            ? await result.current.openFolder('/next')
            : await result.current.onUseInternalRoot()
        expect(opened).toBe(false)
      })
      expect(rootSwitchingRef.current).toBe(false)
      expect(fsApi.setRoot).not.toHaveBeenCalled()
      expect(flushEditorChanges).not.toHaveBeenCalled()
    },
  )
})
