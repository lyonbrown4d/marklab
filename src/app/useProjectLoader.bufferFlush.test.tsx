import { act, renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'
import { createEditorBufferSync } from '@/app/editorBufferSync'
import { flushEditorChanges, registerEditorBufferFlusher } from '@/app/editorCloseLifecycle'
import { useProjectLoader } from '@/app/useProjectLoader'
import { createEditorBufferPersistence } from '@/app/useEditorBufferState'
import { fsApi } from '@/services/fsApi'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
vi.mock('@/runtime/environment', () => ({
  runInDesktop: vi.fn((callback: () => unknown) => Promise.resolve(callback())),
}))
vi.mock('@/services/fsApi', () => ({
  fsApi: { setRoot: vi.fn(), setSingleFile: vi.fn() },
}))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { initialFile: vi.fn(), listChildren: vi.fn(), pathsExist: vi.fn() },
}))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const createProps = () => ({
  rootPath: 'D:/notes',
  rootKind: 'external' as const,
  entries: [],
  tabs: [],
  activeTabId: null,
  locationPathname: '/',
  preserveCurrentRoute: false,
  defaultFileView: 'edit' as const,
  navigate: vi.fn(),
  setEntries: vi.fn(),
  setRootPath: vi.fn(),
  setRootKind: vi.fn(),
  setTabs: vi.fn(),
  setActiveTabId: vi.fn(),
  touchRecentProject: vi.fn(),
})

describe('useProjectLoader editor buffer boundary', () => {
  it('does not switch roots when a queued update fails during flush', async () => {
    let finishFirst: (() => void) | undefined
    const applyBufferUpdate = vi
      .fn()
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = () =>
            resolve({
              kind: 'applied',
              path: 'note.md',
              revision: 1,
              dirty: true,
              session_generation: 4,
            })
        }),
      )
      .mockRejectedValueOnce(new Error('queued update failed'))
    const sync = createEditorBufferSync({
      applyBufferUpdate,
      getBufferStatus: vi.fn(async () => ({
        path: 'note.md',
        revision: 0,
        dirty: false,
        session_generation: 4,
      })),
    })
    const persistence = createEditorBufferPersistence()
    const first = sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: '# One',
      content: '# Two',
    })
    const second = sync.enqueue({
      identity: 'workspace:note.md',
      path: 'note.md',
      previous: '# Two',
      content: '# Three',
    })
    void first.catch(() => undefined)
    void second.catch(() => undefined)
    persistence.trackUpdate(first, 'workspace:note.md')
    persistence.trackUpdate(second, 'workspace:note.md')
    const unregister = registerEditorBufferFlusher(() =>
      persistence.flush(
        async () => undefined,
        async () => undefined,
      ),
    )
    const { result } = renderHook(() => useProjectLoader(createProps()))

    try {
      const switching = result.current.openFolder('D:/next')
      await vi.waitFor(() => expect(applyBufferUpdate).toHaveBeenCalledTimes(1))
      expect(fsApi.setRoot).not.toHaveBeenCalled()
      finishFirst?.()
      await act(async () => switching)

      expect(applyBufferUpdate).toHaveBeenCalledTimes(2)
      expect(fsApi.setRoot).not.toHaveBeenCalled()
      expect(fsApi.setSingleFile).not.toHaveBeenCalled()
      expect(toast.error).toHaveBeenCalledWith('projectLoader.openPathFailed', {
        description: expect.stringContaining('Editor buffer updates failed before flush'),
      })
    } finally {
      unregister()
      await expect(flushEditorChanges()).resolves.toBeUndefined()
    }
  })
})
