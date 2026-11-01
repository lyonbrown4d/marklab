import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import type { FsBufferSnapshot } from '@/services/fsApiSchemas'
import type { WorkspaceTreeDeltaEvent } from '@/types/workspaceTree'

const mocks = vi.hoisted(() => ({
  openBufferSnapshot: vi.fn(),
  applyBufferUpdate: vi.fn(),
  getBufferStatus: vi.fn(),
  flushBuffers: vi.fn(),
  routeState: null as unknown,
  onChanged: vi.fn(),
  handler: null as ((event: WorkspaceTreeDeltaEvent) => void) | null,
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/fsApi', () => ({ fsApi: mocks }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: {
    onChanged: mocks.onChanged,
  },
}))
vi.mock('react-router-dom', () => ({ useLocation: () => ({ state: mocks.routeState }) }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
const snapshot = (path: string, content = `disk:${path}`): FsBufferSnapshot => ({
  path,
  content,
  revision: 0,
  session_generation: 1,
  dirty: false,
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
type Props = { activePath: string; workspaceKey: string; visiblePaths: string[] }
const initialProps: Props = {
  activePath: 'a.md',
  workspaceKey: 'internal:/workspace',
  visiblePaths: ['a.md', 'b.md', 'a.md'],
}
const mount = () =>
  renderHook(
    (props: Props) => {
      const buffer = useEditorBuffer(props)
      return {
        ...buffer,
        first: buffer.bindDocument('a.md', 'first'),
        second: buffer.bindDocument('a.md', 'second'),
        other: buffer.bindDocument('b.md', 'other'),
      }
    },
    { initialProps },
  )
const changed = (path: string, revision: number) =>
  act(() =>
    mocks.handler?.({
      kind: 'changes',
      generation: 1,
      root: { kind: 'internal', path: '/workspace' },
      previousRevision: revision - 1,
      revision,
      changes: [{ type: 'changed', path }],
    }),
  )

beforeEach(() => {
  vi.clearAllMocks()
  mocks.routeState = null
  mocks.openBufferSnapshot.mockImplementation(async (path: string) => snapshot(path))
  let revision = 0
  mocks.applyBufferUpdate.mockImplementation(async ({ path }: { path: string }) => ({
    kind: 'applied',
    path,
    revision: ++revision,
    session_generation: 1,
    dirty: true,
  }))
  mocks.flushBuffers.mockResolvedValue(undefined)
  mocks.getBufferStatus.mockResolvedValue({
    path: 'a.md',
    revision: 10,
    session_generation: 1,
    dirty: false,
  })
  mocks.onChanged.mockImplementation((handler: (event: WorkspaceTreeDeltaEvent) => void) => {
    mocks.handler = handler
    return () => {
      mocks.handler = null
    }
  })
})
afterEach(cleanup)

describe('visible panes sharing workspace buffers', () => {
  it('loads visible A and B concurrently, deduplicates paths, and preserves requests on focus changes', async () => {
    const a = deferred<FsBufferSnapshot>(),
      b = deferred<FsBufferSnapshot>()
    mocks.openBufferSnapshot.mockImplementation((path: string) =>
      path === 'a.md' ? a.promise : b.promise,
    )
    const { result, rerender } = mount()
    expect(mocks.openBufferSnapshot).toHaveBeenCalledTimes(2)
    rerender({ ...initialProps, activePath: 'b.md' })
    expect(mocks.openBufferSnapshot).toHaveBeenCalledTimes(2)
    changed('a.md', 1)
    expect(mocks.openBufferSnapshot.mock.calls.map(([path]) => path)).toEqual([
      'a.md',
      'b.md',
      'a.md',
    ])
    await act(async () => b.resolve(snapshot('b.md')))
    expect(result.current.fileContents['b.md']).toBe('disk:b.md')
    expect(result.current.loadingPaths['a.md']).toBe(true)
    await act(async () => a.resolve(snapshot('a.md')))
    expect(result.current.fileContents).toEqual({ 'a.md': 'disk:a.md', 'b.md': 'disk:b.md' })
    expect(result.current.loadingPaths).toEqual({})
    expect(mocks.onChanged).toHaveBeenCalledTimes(1)
  })

  it('retries only the active request without restarting another visible document', async () => {
    const firstA = deferred<FsBufferSnapshot>()
    const secondA = deferred<FsBufferSnapshot>()
    const b = deferred<FsBufferSnapshot>()
    mocks.openBufferSnapshot
      .mockImplementationOnce(() => firstA.promise)
      .mockImplementationOnce(() => b.promise)
      .mockImplementationOnce(() => secondA.promise)
    const { result, rerender } = mount()
    mocks.routeState = { editorLoadGeneration: 1 }
    rerender(initialProps)
    expect(mocks.openBufferSnapshot.mock.calls.map(([path]) => path)).toEqual([
      'a.md',
      'b.md',
      'a.md',
    ])
    await act(async () => {
      b.resolve(snapshot('b.md'))
      secondA.resolve(snapshot('a.md', 'retried A'))
    })
    await act(async () => firstA.resolve(snapshot('a.md', 'old A')))
    expect(result.current.fileContents).toEqual({ 'a.md': 'retried A', 'b.md': 'disk:b.md' })
  })

  it('does not retry another visible pane failure when retrying the active pane', async () => {
    mocks.openBufferSnapshot
      .mockRejectedValueOnce(new Error('A failed'))
      .mockRejectedValueOnce(new Error('B failed'))
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.saveStates['b.md']?.status).toBe('error'))
    mocks.routeState = { editorLoadGeneration: 1 }
    rerender(initialProps)
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    expect(mocks.openBufferSnapshot.mock.calls.map(([path]) => path)).toEqual([
      'a.md',
      'b.md',
      'a.md',
    ])
    expect(result.current.saveStates['b.md']?.status).toBe('error')
  })

  it('cancels every affected visible load when a path is renamed', async () => {
    const a = deferred<FsBufferSnapshot>(),
      b = deferred<FsBufferSnapshot>()
    mocks.openBufferSnapshot.mockImplementation((path: string) =>
      path === 'a.md' ? a.promise : b.promise,
    )
    const { result } = mount()
    let finish!: (committed: boolean) => void
    act(() => {
      finish = result.current.beginPathMutation('b.md', 'renamed.md')
    })
    await act(async () => {
      b.resolve(snapshot('b.md'))
      a.resolve(snapshot('a.md'))
    })
    expect(result.current.fileContents['b.md']).toBeUndefined()
    expect(result.current.fileContents['a.md']).toBe('disk:a.md')
    await act(async () => finish(true))
    expect(mocks.openBufferSnapshot).toHaveBeenCalledTimes(2)
    expect(result.current.fileContents['b.md']).toBeUndefined()
  })

  it('accepts B edits while A is active and successive snapshots from the same pane', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.fileContents['b.md']).toBe('disk:b.md'))
    const edit = result.current.other
    act(() => {
      edit('first B')
      edit('second B')
    })
    expect(result.current.editorValue).toBe('disk:a.md')
    expect(result.current.fileContents['b.md']).toBe('second B')
    expect(result.current.dirtyPaths['b.md']).toBe(true)
    await waitFor(() => expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(2))
    expect(
      mocks.applyBufferUpdate.mock.calls.map(([request]) => [request.path, request.base_revision]),
    ).toEqual([
      ['b.md', 0],
      ['b.md', 1],
    ])
  })

  it('rejects another stale pane without changing the shared buffer or writing, then accepts a fresh render', async () => {
    const rejected = vi.fn()
    const { result } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    const staleSecond = result.current.bindDocument('a.md', 'second', rejected)
    const staleFirst = result.current.first
    act(() => staleFirst('first owner'))
    await waitFor(() => expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(1))
    const before = result.current.saveStates['a.md']
    act(() => staleSecond('second owner draft'))
    expect(rejected).toHaveBeenCalledWith('second owner draft', 'first owner')
    expect(result.current.editorValue).toBe('first owner')
    expect(result.current.saveStates['a.md']).toBe(before)
    expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(1)
    act(() => result.current.second('fresh second owner'))
    await waitFor(() => expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(2))
    expect(mocks.applyBufferUpdate.mock.calls[1]![0].base_revision).toBe(1)
    act(() => staleFirst('first owner stale draft'))
    expect(result.current.editorValue).toBe('fresh second owner')
    expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(2)
  })

  it('serializes fresh same-file pane owners through one pending CAS queue', async () => {
    const applied = deferred<Awaited<ReturnType<typeof mocks.applyBufferUpdate>>>()
    mocks.applyBufferUpdate.mockImplementationOnce(() => applied.promise)
    const { result } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    act(() => result.current.first('first queued'))
    await waitFor(() => expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(1))
    act(() => result.current.second('second queued'))
    expect(result.current.editorValue).toBe('second queued')
    expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(1)
    await act(async () =>
      applied.resolve({
        kind: 'applied',
        path: 'a.md',
        revision: 7,
        session_generation: 1,
        dirty: true,
      }),
    )
    await waitFor(() => expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(2))
    expect(mocks.applyBufferUpdate.mock.calls[1]![0].base_revision).toBe(7)
    expect(result.current.saveStates['a.md']?.status).toBe('saving')
  })

  it('reloads clean inactive visible text, rejects the old disk generation, and preserves dirty visible text', async () => {
    const { result } = mount()
    await waitFor(() => expect(result.current.fileContents['b.md']).toBe('disk:b.md'))
    const rejected = vi.fn()
    const old = result.current.bindDocument('b.md', 'other', rejected)
    mocks.openBufferSnapshot.mockResolvedValueOnce(snapshot('b.md', 'new disk B'))
    changed('b.md', 1)
    await waitFor(() => expect(result.current.fileContents['b.md']).toBe('new disk B'))
    act(() => old('old pane draft'))
    expect(rejected).toHaveBeenCalledWith('old pane draft', 'new disk B')
    expect(mocks.applyBufferUpdate).not.toHaveBeenCalled()
    act(() => result.current.other('local B'))
    await waitFor(() => expect(mocks.applyBufferUpdate).toHaveBeenCalledTimes(1))
    mocks.openBufferSnapshot.mockClear()
    changed('b.md', 2)
    expect(mocks.openBufferSnapshot).not.toHaveBeenCalled()
    expect(result.current.fileContents['b.md']).toBe('local B')
    expect(result.current.dirtyPaths['b.md']).toBe(true)
  })

  it('retains a delayed old-workspace pane draft as an error without applying it to the new workspace', async () => {
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    const rejected = vi.fn()
    const previous = result.current.bindDocument('b.md', 'other', rejected)
    rerender({ ...initialProps, workspaceKey: 'external:/new' })
    await waitFor(() => expect(result.current.fileContents['b.md']).toBe('disk:b.md'))
    act(() => previous('retained old workspace draft'))
    expect(rejected).not.toHaveBeenCalled()
    expect(mocks.applyBufferUpdate).not.toHaveBeenCalled()
    expect(result.current.fileContents['b.md']).toBe('disk:b.md')
    rerender(initialProps)
    expect(result.current.fileContents['b.md']).toBe('retained old workspace draft')
    expect(result.current.dirtyPaths['b.md']).toBe(true)
    expect(result.current.saveStates['b.md']?.status).toBe('error')
  })
})
