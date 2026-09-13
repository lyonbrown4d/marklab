import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProjectPathActions } from '@/app/useProjectPathActions'
import { createFileTab } from '@/logic/tabs'

const api = vi.hoisted(() => ({
  createFile: vi.fn(),
  createDir: vi.fn(),
  deletePath: vi.fn(),
  renamePath: vi.fn(),
  movePath: vi.fn(),
}))
vi.mock('@/services/fsApi', () => ({ fsApi: api }))
vi.mock('@/runtime/environment', () => ({
  runInDesktop: async (work: () => Promise<unknown>) => {
    await work()
  },
}))

type Options = Parameters<typeof useProjectPathActions>[0]
const options = (): Options => ({
  rootPath: '/workspace',
  rootKind: 'internal',
  tabs: [createFileTab('draft.md')],
  activeTabId: 'file:edit:draft.md',
  locationPathname: '/files/edit/draft.md',
  mutationInProgress: { current: false },
  loadWorkspace: vi.fn().mockResolvedValue(undefined),
})
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
beforeEach(() => {
  vi.resetAllMocks()
})

const cases = [
  {
    action: 'createFile',
    api: 'createFile',
    input: 'New note',
    path: 'New note.md',
    preserve: true,
  },
  {
    action: 'createFolder',
    api: 'createDir',
    input: 'New folder',
    path: 'New folder',
    preserve: true,
  },
  { action: 'deletePath', api: 'deletePath', input: 'draft.md', path: 'draft.md', preserve: false },
] as const

describe('workspace create and delete refresh', () => {
  it.each(cases)('refreshes the workspace after $action completes', async (testCase) => {
    const pending = deferred()
    api[testCase.api].mockReturnValueOnce(pending.promise)
    const props = options()
    const { result } = renderHook(() => useProjectPathActions(props))
    const task = result.current[testCase.action](testCase.input)
    expect(api[testCase.api]).toHaveBeenCalledExactlyOnceWith(testCase.path)
    expect(props.loadWorkspace).not.toHaveBeenCalled()
    expect(props.mutationInProgress.current).toBe(true)
    await act(async () => {
      pending.resolve()
      await task
    })
    expect(props.loadWorkspace).toHaveBeenCalledExactlyOnceWith({
      preserveCurrentRoute: testCase.preserve,
    })
    expect(props.mutationInProgress.current).toBe(false)
  })

  it.each(cases)(
    'propagates $action failures without refreshing and permits retry',
    async (testCase) => {
      api[testCase.api]
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(undefined)
      const props = options()
      const { result } = renderHook(() => useProjectPathActions(props))
      await act(async () => {
        await expect(result.current[testCase.action](testCase.input)).rejects.toThrow(
          'Permission denied',
        )
      })
      expect(props.loadWorkspace).not.toHaveBeenCalled()
      expect(props.mutationInProgress.current).toBe(false)
      await act(async () => {
        await result.current[testCase.action](testCase.input)
      })
      expect(props.loadWorkspace).toHaveBeenCalledTimes(1)
    },
  )

  it('does not refresh another workspace after an old creation finishes', async () => {
    const pending = deferred()
    api.createFile.mockReturnValueOnce(pending.promise)
    const props = options()
    const { result, rerender } = renderHook((value: Options) => useProjectPathActions(value), {
      initialProps: props,
    })
    const task = result.current.createFile('New.md')
    rerender({ ...props, rootPath: '/another' })
    await act(async () => {
      pending.resolve()
      await task
    })
    expect(props.loadWorkspace).not.toHaveBeenCalled()
    expect(props.mutationInProgress.current).toBe(false)
  })

  it('preserves navigation made while a deletion is pending', async () => {
    const pending = deferred()
    api.deletePath.mockReturnValueOnce(pending.promise)
    const props = options()
    const { result, rerender } = renderHook((value: Options) => useProjectPathActions(value), {
      initialProps: props,
    })
    const task = result.current.deletePath('draft.md')
    rerender({ ...props, locationPathname: '/settings' })
    await act(async () => {
      pending.resolve()
      await task
    })
    expect(props.loadWorkspace).toHaveBeenCalledWith({ preserveCurrentRoute: true })
  })

  it('rejects a second path mutation until creation and refresh finish', async () => {
    const pending = deferred()
    api.createFile.mockReturnValueOnce(pending.promise)
    const props = options()
    const { result } = renderHook(() => useProjectPathActions(props))
    const task = result.current.createFile('New.md')
    await expect(result.current.deletePath('draft.md')).rejects.toThrow(
      'Another workspace path change',
    )
    expect(api.deletePath).not.toHaveBeenCalled()
    await act(async () => {
      pending.resolve()
      await task
    })
    expect(props.mutationInProgress.current).toBe(false)
  })
})
