import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBuffer } from '@/app/useEditorBuffer'

const api = vi.hoisted(() => ({
  applyBufferUpdate: vi.fn(),
  openFile: vi.fn(),
  updateBuffer: vi.fn(),
  flushBuffers: vi.fn(),
  getBufferStatus: vi.fn(),
}))
const tree = vi.hoisted(() => ({ handler: null as null | ((event: unknown) => void) }))
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({ listen: vi.fn(async () => vi.fn()) }))
vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: {
    onChanged: (handler: (event: unknown) => void) => {
      tree.handler = handler
      return () => {
        if (tree.handler === handler) tree.handler = null
      }
    },
  },
}))
vi.mock('@/services/fsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/fsApi')>()),
  fsApi: api,
}))
vi.mock('react-router-dom', () => ({ useLocation: () => ({ state: null }) }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const Harness = () => {
  const [activePath, setActivePath] = useState('current.md')
  const [workspaceKey, setWorkspaceKey] = useState('internal:/workspace')
  const buffer = useEditorBuffer({ activePath, workspaceKey })
  return (
    <div>
      <div data-testid="value">{buffer.editorValue}</div>
      <div data-testid="loading">{String(Boolean(buffer.loadingPaths[activePath]))}</div>
      <div data-testid="dirty">{String(Boolean(buffer.dirtyPaths[activePath]))}</div>
      <button onClick={() => buffer.onEditorChange('local edit')}>edit</button>
      <button onClick={() => setActivePath('other.md')}>other</button>
      <button onClick={() => setActivePath('current.md')}>current</button>
      <button onClick={() => setWorkspaceKey('external:/other')}>workspace</button>
    </div>
  )
}

let revision = 0
const changed = (
  changes: unknown[] = [{ type: 'changed', path: 'current.md' }],
  options: {
    kind?: 'changes' | 'invalidated'
    previousRevision?: number
    root?: { kind: 'internal' | 'external'; path: string }
  } = {},
) => {
  const previousRevision = options.previousRevision ?? revision
  revision = previousRevision + 1
  tree.handler?.({
    kind: options.kind ?? 'changes',
    root: options.root ?? { kind: 'internal', path: '/workspace' },
    previousRevision,
    revision,
    ...(options.kind === 'invalidated' ? {} : { changes }),
  })
}

beforeEach(() => {
  tree.handler = null
  revision = 0
  vi.clearAllMocks()
  api.openFile.mockImplementation(async (path: string) =>
    path === 'current.md' ? 'initial' : 'other text',
  )
  api.updateBuffer.mockResolvedValue({ path: 'current.md', revision: 1, dirty: true })
  api.applyBufferUpdate.mockResolvedValue({
    kind: 'applied',
    path: 'current.md',
    revision: 1,
    dirty: true,
    session_generation: 3,
  })
  api.getBufferStatus.mockResolvedValue({
    path: 'current.md',
    revision: 1,
    dirty: true,
    session_generation: 3,
  })
  api.flushBuffers.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  tree.handler = null
})

describe('external Markdown buffer synchronization', () => {
  it('updates the clean active document without entering loading state', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    let finish!: (content: string) => void
    api.openFile.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    act(() => changed())
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
    expect(screen.getByTestId('value')).toHaveTextContent('initial')
    await act(async () => finish('external edit'))
    expect(screen.getByTestId('value')).toHaveTextContent('external edit')
    expect(api.updateBuffer).not.toHaveBeenCalled()
  })

  it('does not overwrite a dirty local document', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    fireEvent.click(screen.getByText('edit'))
    await waitFor(() => expect(api.applyBufferUpdate).toHaveBeenCalled())
    api.openFile.mockClear()
    act(() => changed())
    expect(screen.getByTestId('value')).toHaveTextContent('local edit')
    expect(screen.getByTestId('dirty')).toHaveTextContent('true')
    expect(api.openFile).not.toHaveBeenCalled()
  })

  it('keeps input typed while a background disk read is in flight', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    let finish!: (content: string) => void
    api.openFile.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    act(() => changed())
    fireEvent.click(screen.getByText('edit'))
    await act(async () => finish('external edit'))
    expect(screen.getByTestId('value')).toHaveTextContent('local edit')
    expect(screen.getByTestId('dirty')).toHaveTextContent('true')
  })

  it('reloads an inactive clean document when it is opened again', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    fireEvent.click(screen.getByText('other'))
    await screen.findByText('other text')
    api.openFile.mockImplementation(async (path: string) =>
      path === 'current.md' ? 'external edit' : 'other text',
    )
    api.openFile.mockClear()
    act(() => changed())
    expect(api.openFile).not.toHaveBeenCalledWith('other.md')
    fireEvent.click(screen.getByText('current'))
    await screen.findByText('external edit')
  })

  it('ignores notifications from another workspace', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    api.openFile.mockClear()
    act(() => {
      changed([], { root: { kind: 'external', path: '/elsewhere' } })
    })
    expect(api.openFile).not.toHaveBeenCalled()
  })

  it('ignores an old read after switching workspaces', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    let finish!: (content: string) => void
    api.openFile.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    act(() => changed())
    api.openFile.mockResolvedValueOnce('new workspace')
    fireEvent.click(screen.getByText('workspace'))
    await screen.findByText('new workspace')
    await act(async () => finish('old workspace result'))
    expect(screen.getByTestId('value')).toHaveTextContent('new workspace')
  })

  it('keeps the displayed document when a background read fails', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    api.openFile.mockRejectedValueOnce(new Error('File temporarily unavailable'))
    await act(async () => changed())
    expect(screen.getByTestId('value')).toHaveTextContent('initial')
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })

  it('keeps newer input when an older background read fails', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    let fail!: (error: Error) => void
    api.openFile.mockImplementationOnce(
      () =>
        new Promise<string>((_, reject) => {
          fail = reject
        }),
    )
    act(() => changed())
    fireEvent.click(screen.getByText('edit'))
    await act(async () => fail(new Error('Read failed')))
    expect(screen.getByTestId('value')).toHaveTextContent('local edit')
    expect(screen.getByTestId('dirty')).toHaveTextContent('true')
  })

  it('does not reopen a path removed or renamed away', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    api.openFile.mockClear()
    act(() =>
      changed([
        { type: 'removed', path: 'current.md' },
        {
          type: 'renamed',
          from: 'current.md',
          entry: { kind: 'file', name: 'renamed.md', path: 'renamed.md' },
        },
      ]),
    )
    expect(api.openFile).not.toHaveBeenCalled()
    expect(screen.getByTestId('value')).toHaveTextContent('initial')
  })

  it('does not reload the active document for an ordered change to another path', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    api.openFile.mockClear()
    act(() => changed([{ type: 'changed', path: 'other.md' }]))
    expect(api.openFile).not.toHaveBeenCalled()
  })

  it('conservatively reloads after invalidation or a revision gap', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    api.openFile.mockResolvedValue('after invalidation')
    act(() => changed([], { kind: 'invalidated' }))
    await screen.findByText('after invalidation')

    api.openFile.mockResolvedValue('after gap')
    act(() => changed([], { previousRevision: revision + 3 }))
    await screen.findByText('after gap')
  })
})
