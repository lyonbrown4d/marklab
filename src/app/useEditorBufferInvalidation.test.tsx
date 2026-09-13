import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBuffer } from '@/app/useEditorBuffer'

const api = vi.hoisted(() => ({
  openFile: vi.fn(),
  updateBuffer: vi.fn(),
  flushBuffers: vi.fn(),
  getBufferStatus: vi.fn(),
}))
const events = vi.hoisted(() => new Map<string, (event: { payload: unknown }) => void>())
vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/runtime/events', () => ({
  listen: vi.fn(async (name: string, callback: (event: { payload: unknown }) => void) => {
    events.set(name, callback)
    return () => {
      events.delete(name)
    }
  }),
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

const changed = (root = { kind: 'internal', path: '/workspace' }) => {
  events.get('fs-changed')?.({
    payload: {
      root,
      entries: [
        { kind: 'file', path: 'current.md' },
        { kind: 'file', path: 'other.md' },
      ],
    },
  })
}

beforeEach(() => {
  events.clear()
  vi.clearAllMocks()
  api.openFile.mockImplementation(async (path: string) =>
    path === 'current.md' ? 'initial' : 'other text',
  )
  api.updateBuffer.mockResolvedValue({ path: 'current.md', revision: 1, dirty: true })
  api.getBufferStatus.mockResolvedValue({ path: 'current.md', revision: 1, dirty: true })
  api.flushBuffers.mockResolvedValue(undefined)
})
afterEach(() => {
  cleanup()
  events.clear()
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
    await waitFor(() => expect(api.updateBuffer).toHaveBeenCalled())
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
    act(() => changed())
    await waitFor(() => expect(api.openFile).toHaveBeenLastCalledWith('other.md'))
    fireEvent.click(screen.getByText('current'))
    await screen.findByText('external edit')
  })

  it('ignores notifications from another workspace and malformed payloads', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    api.openFile.mockClear()
    act(() => {
      changed({ kind: 'external', path: '/elsewhere' })
      events.get('fs-changed')?.({ payload: { entries: [] } })
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

  it('does not reopen a path removed by a rename or deletion snapshot', async () => {
    render(<Harness />)
    await screen.findByText('initial')
    api.openFile.mockClear()
    act(() =>
      events.get('fs-changed')?.({
        payload: {
          root: { kind: 'internal', path: '/workspace' },
          entries: [{ kind: 'file', path: 'renamed.md' }],
        },
      }),
    )
    expect(api.openFile).not.toHaveBeenCalled()
    expect(screen.getByTestId('value')).toHaveTextContent('initial')
  })
})
