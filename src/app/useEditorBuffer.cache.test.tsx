import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBuffer } from '@/app/useEditorBuffer'
import { flushEditorChangesForClose } from '@/app/editorCloseLifecycle'
import { EDITOR_BUFFER_CACHE_LIMITS } from '@/app/editorBufferCachePolicy'

const mocks = vi.hoisted(() => ({
  openFile: vi.fn(),
  applyBufferUpdate: vi.fn(),
  getBufferStatus: vi.fn(),
  flushBuffers: vi.fn(),
}))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: vi.fn(() => vi.fn()) },
}))
vi.mock('@/services/fsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/fsApi')>()),
  fsApi: mocks,
}))
vi.mock('react-router-dom', () => ({ useLocation: () => ({ state: null }) }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const status = (dirty: boolean) => ({ path: 'a.md', revision: 1, dirty, session_generation: 1 })
type Props = { workspaceKey: string; activePath: string | null; openPaths: string[] }
const initialProps: Props = { workspaceKey: 'first', activePath: 'a.md', openPaths: ['a.md'] }
const mount = () => renderHook((props: Props) => useEditorBuffer(props), { initialProps })
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.openFile.mockImplementation((path: string) => Promise.resolve(`disk:${path}`))
  mocks.applyBufferUpdate.mockResolvedValue({ kind: 'applied', ...status(true) })
  mocks.getBufferStatus.mockResolvedValue(status(true))
  mocks.flushBuffers.mockResolvedValue(0)
})

describe('editor buffer cache lifecycle', () => {
  it('releases saved closed text and reloads fresh content on reopen', async () => {
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    rerender({ ...initialProps, activePath: null, openPaths: [] })
    expect(result.current.fileContents).toEqual({})
    expect(result.current.saveStates).toEqual({})
    mocks.openFile.mockResolvedValueOnce('new disk content')
    rerender(initialProps)
    await waitFor(() => expect(result.current.editorValue).toBe('new disk content'))
    expect(mocks.openFile).toHaveBeenCalledTimes(2)
  })

  it('keeps recent open text and active graph text even without a tab', async () => {
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    rerender({ ...initialProps, activePath: 'b.md', openPaths: ['a.md', 'b.md'] })
    await waitFor(() => expect(result.current.editorValue).toBe('disk:b.md'))
    rerender({ ...initialProps, openPaths: ['a.md', 'b.md'] })
    expect(result.current.editorValue).toBe('disk:a.md')
    expect(mocks.openFile).toHaveBeenCalledTimes(2)
    rerender({ ...initialProps, openPaths: [] })
    expect(result.current.editorValue).toBe('disk:a.md')
  })

  it('protects a closed pending update and flushes it before releasing the saved text', async () => {
    const update = deferred<ReturnType<typeof status> & { kind: 'applied' }>()
    mocks.applyBufferUpdate.mockReturnValueOnce(update.promise)
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    act(() =>
      result.current.onEditorChange('edited', [
        { offset: 0, delete_length: 9, insert_text: 'edited' },
      ]),
    )
    await waitFor(() => expect(mocks.applyBufferUpdate).toHaveBeenCalledOnce())
    rerender({ ...initialProps, activePath: null, openPaths: [] })
    expect(result.current.fileContents['a.md']).toBe('edited')
    let close!: Promise<void>
    act(() => {
      close = flushEditorChangesForClose()
    })
    expect(mocks.flushBuffers).not.toHaveBeenCalled()
    await act(async () => {
      mocks.getBufferStatus.mockResolvedValue(status(false))
      update.resolve({ kind: 'applied', ...status(true) })
      await close
    })
    await waitFor(() => expect(result.current.fileContents).toEqual({}))
    expect(result.current.dirtyPaths).toEqual({})
  })

  it('retains failed closed saves and rejects close flush rather than losing the draft', async () => {
    mocks.applyBufferUpdate.mockRejectedValueOnce(new Error('write failed'))
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    act(() =>
      result.current.onEditorChange('draft', [
        { offset: 0, delete_length: 9, insert_text: 'draft' },
      ]),
    )
    await waitFor(() => expect(result.current.saveStates['a.md']?.status).toBe('error'))
    rerender({ ...initialProps, activePath: null, openPaths: [] })
    await act(async () => {
      await expect(flushEditorChangesForClose()).rejects.toThrow('Editor buffer updates failed')
    })
    expect(result.current.fileContents['a.md']).toBe('draft')
    expect(result.current.dirtyPaths['a.md']).toBe(true)
  })

  it('releases old clean workspace contents and retains delayed stale edits under their original owner', async () => {
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    const oldChange = result.current.onEditorChange
    rerender({ ...initialProps, workspaceKey: 'second' })
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    act(() => oldChange('old workspace draft'))
    expect(result.current.editorValue).toBe('disk:a.md')
    expect(mocks.applyBufferUpdate).not.toHaveBeenCalled()
    rerender(initialProps)
    expect(result.current.editorValue).toBe('old workspace draft')
    expect(result.current.dirtyPaths['a.md']).toBe(true)
    expect(result.current.saveStates['a.md']?.status).toBe('error')
  })

  it('ignores delayed callbacks from an evicted editor once the same path has loaded newer disk text', async () => {
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    const oldChange = result.current.onEditorChange
    rerender({ ...initialProps, activePath: null, openPaths: [] })
    mocks.openFile.mockResolvedValueOnce('new disk content')
    rerender(initialProps)
    await waitFor(() => expect(result.current.editorValue).toBe('new disk content'))
    act(() => oldChange('stale serialization'))
    expect(result.current.editorValue).toBe('new disk content')
    expect(mocks.applyBufferUpdate).not.toHaveBeenCalled()
  })

  it('evicts a large clean open document when a second document crosses the text budget', async () => {
    mocks.openFile.mockResolvedValueOnce('x'.repeat(EDITOR_BUFFER_CACHE_LIMITS.maxTextBytes / 2))
    const { result, rerender } = mount()
    await waitFor(() =>
      expect(result.current.editorValue.length).toBe(EDITOR_BUFFER_CACHE_LIMITS.maxTextBytes / 2),
    )
    rerender({ ...initialProps, activePath: 'b.md', openPaths: ['a.md', 'b.md'] })
    await waitFor(() => expect(result.current.editorValue).toBe('disk:b.md'))
    expect(Object.keys(result.current.fileContents)).toEqual(['b.md'])
  })
  it('reloads an old clean workspace instead of preserving its entire text cache', async () => {
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    rerender({ ...initialProps, workspaceKey: 'second' })
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    mocks.openFile.mockResolvedValueOnce('fresh first workspace')
    rerender(initialProps)
    await waitFor(() => expect(result.current.editorValue).toBe('fresh first workspace'))
    expect(mocks.openFile).toHaveBeenCalledTimes(3)
  })

  it('ignores an old workspace load arriving after the same path loads in a new workspace', async () => {
    const oldLoad = deferred<string>()
    mocks.openFile.mockReturnValueOnce(oldLoad.promise)
    const { result, rerender } = mount()
    rerender({ ...initialProps, workspaceKey: 'second' })
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    await act(async () => {
      oldLoad.resolve('stale first workspace')
    })
    expect(result.current.editorValue).toBe('disk:a.md')
    expect(result.current.dirtyPaths).toEqual({})
  })

  it('retains saved text when a delayed close snapshot arrives after clean eviction', async () => {
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    const delayedChange = result.current.onEditorChange
    rerender({ ...initialProps, activePath: null, openPaths: [] })
    expect(result.current.fileContents).toEqual({})
    act(() =>
      delayedChange('late edit', [{ offset: 0, delete_length: 9, insert_text: 'late edit' }]),
    )
    await waitFor(() => expect(result.current.fileContents['a.md']).toBe('late edit'))
    expect(result.current.dirtyPaths['a.md']).toBe(true)
    await waitFor(() => expect(result.current.saveStates['a.md']?.status).toBe('saving'))
  })
  it('prunes a closed persisted replacement once an invalidated older update finishes', async () => {
    const update = deferred<ReturnType<typeof status> & { kind: 'applied' }>()
    mocks.applyBufferUpdate.mockReturnValueOnce(update.promise)
    const { result, rerender } = mount()
    await waitFor(() => expect(result.current.editorValue).toBe('disk:a.md'))
    act(() =>
      result.current.onEditorChange('edited', [
        { offset: 0, delete_length: 9, insert_text: 'edited' },
      ]),
    )
    await waitFor(() => expect(mocks.applyBufferUpdate).toHaveBeenCalledOnce())
    rerender({ ...initialProps, activePath: null, openPaths: [] })
    act(() => result.current.onPersistedContentChange('a.md', 'persisted replacement'))
    expect(result.current.fileContents['a.md']).toBe('persisted replacement')
    await act(async () => {
      update.resolve({ kind: 'applied', ...status(true) })
    })
    await waitFor(() => expect(result.current.fileContents).toEqual({}))
    expect(result.current.dirtyPaths).toEqual({})
  })
})
