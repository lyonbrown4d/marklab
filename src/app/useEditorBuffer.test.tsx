import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBuffer } from '@/app/useEditorBuffer'

const fsApiMock = vi.hoisted(() => ({
  applyBufferUpdate: vi.fn(),
  flushBuffers: vi.fn(),
  getBufferStatus: vi.fn(),
  openFile: vi.fn(),
  updateBuffer: vi.fn(),
}))

const eventHandlers = vi.hoisted(
  () => new Map<string, (event: { payload: unknown }) => void | Promise<void>>(),
)

vi.mock('@/runtime/environment', () => ({
  isDesktopRuntime: () => true,
}))

vi.mock('@/services/workspaceTreeApi', () => ({
  workspaceTreeApi: { onChanged: vi.fn(() => vi.fn()) },
}))

vi.mock('@/services/fsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/fsApi')>()
  return {
    ...actual,
    fsApi: fsApiMock,
  }
})

vi.mock('@/runtime/events', () => ({
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    eventHandlers.set(event, handler)
    return vi.fn()
  }),
}))

vi.mock('react-router-dom', () => ({ useLocation: () => ({ state: null }) }))
vi.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

const Harness = () => {
  const buffer = useEditorBuffer({
    activePath: 'notes/current.md',
    workspaceKey: 'internal:/workspace',
  })
  const state = buffer.saveStates['notes/current.md']?.status ?? 'none'
  const dirty = Boolean(buffer.dirtyPaths['notes/current.md'])

  return (
    <button type="button" onClick={() => buffer.onEditorChange('changed')}>
      {state}:{String(dirty)}
    </button>
  )
}

const SwitchingHarness = () => {
  const [activePath, setActivePath] = useState('notes/current.md')
  const buffer = useEditorBuffer({
    activePath,
    workspaceKey: 'internal:/workspace',
  })
  const state = buffer.saveStates[activePath]?.status ?? 'none'
  const dirty = Boolean(buffer.dirtyPaths[activePath])

  return (
    <div>
      <div data-testid="active">{activePath}</div>
      <div data-testid="value">{buffer.editorValue}</div>
      <div data-testid="state">
        {state}:{String(dirty)}
      </div>
      <button type="button" onClick={() => buffer.onEditorChange('changed')}>
        edit
      </button>
      <button type="button" onClick={() => setActivePath('notes/other.md')}>
        other
      </button>
      <button type="button" onClick={() => setActivePath('notes/current.md')}>
        current
      </button>
    </div>
  )
}

const LoadingHarness = () => {
  const buffer = useEditorBuffer({
    activePath: 'notes/current.md',
    workspaceKey: 'internal:/workspace',
  })

  return (
    <div>
      <div data-testid="loading">{String(Boolean(buffer.loadingPaths['notes/current.md']))}</div>
      <div data-testid="value">{buffer.editorValue}</div>
    </div>
  )
}

const PersistedContentHarness = () => {
  const buffer = useEditorBuffer({
    activePath: 'notes/current.md',
    workspaceKey: 'internal:/workspace',
  })
  const state = buffer.saveStates['notes/current.md']?.status ?? 'none'
  const dirty = Boolean(buffer.dirtyPaths['notes/current.md'])

  return (
    <div>
      <div data-testid="persisted-value">{buffer.editorValue}</div>
      <div data-testid="persisted-state">
        {state}:{String(dirty)}
      </div>
      <button
        type="button"
        onClick={() => buffer.onPersistedContentChange('notes/current.md', 'restored')}
      >
        restore persisted
      </button>
    </div>
  )
}

beforeEach(() => {
  eventHandlers.clear()
  fsApiMock.flushBuffers.mockResolvedValue(0)
  fsApiMock.getBufferStatus.mockResolvedValue({
    path: 'notes/current.md',
    revision: 1,
    dirty: true,
    session_generation: 3,
  })
  fsApiMock.openFile.mockImplementation((path: string) =>
    Promise.resolve(path === 'notes/other.md' ? 'other' : 'initial'),
  )
  fsApiMock.updateBuffer.mockResolvedValue({
    path: 'notes/current.md',
    revision: 1,
    dirty: true,
    session_generation: 3,
  })
  fsApiMock.applyBufferUpdate.mockResolvedValue({
    kind: 'applied',
    path: 'notes/current.md',
    revision: 1,
    dirty: true,
    session_generation: 3,
  })
})

afterEach(() => {
  eventHandlers.clear()
})

describe('useEditorBuffer', () => {
  it('applies persisted content without writing it back through the dirty buffer', async () => {
    const user = userEvent.setup()
    render(<PersistedContentHarness />)

    expect(await screen.findByTestId('persisted-value')).toHaveTextContent('initial')
    expect(screen.getByTestId('persisted-state')).toHaveTextContent('saved:false')
    fsApiMock.applyBufferUpdate.mockClear()
    fsApiMock.flushBuffers.mockClear()

    await user.click(screen.getByRole('button', { name: 'restore persisted' }))

    expect(screen.getByTestId('persisted-value')).toHaveTextContent('restored')
    expect(screen.getByTestId('persisted-state')).toHaveTextContent('saved:false')
    expect(fsApiMock.applyBufferUpdate).not.toHaveBeenCalled()
    expect(fsApiMock.flushBuffers).not.toHaveBeenCalled()
  })

  it('keeps a file dirty until the desktop buffer reports a clean flush', async () => {
    render(<Harness />)

    expect(await screen.findByText('saved:false')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('unsaved:true')).toBeInTheDocument()

    await waitFor(
      () => {
        expect(fsApiMock.applyBufferUpdate).toHaveBeenCalledWith({
          path: 'notes/current.md',
          base_revision: 1,
          session_generation: 3,
          update: {
            kind: 'patch',
            changes: [{ offset: 0, delete_length: 7, insert_text: 'changed' }],
          },
        })
      },
      { timeout: 2000 },
    )
    expect(screen.getByText('saving:true')).toBeInTheDocument()

    await act(async () => {
      eventHandlers.get('fs-buffer-status')?.({
        payload: {
          path: 'notes/current.md',
          revision: 1,
          dirty: false,
        },
      })
    })

    expect(screen.getByText('saved:false')).toBeInTheDocument()
  })

  it('does not let stale dirty events replace a newer unsaved state', async () => {
    let resolveUpdate:
      | ((status: {
          kind: 'applied'
          path: string
          revision: number
          dirty: boolean
          session_generation: number
        }) => void)
      | undefined
    fsApiMock.applyBufferUpdate.mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve
      }),
    )

    const user = userEvent.setup()
    render(<Harness />)

    expect(await screen.findByText('saved:false')).toBeInTheDocument()

    await user.click(screen.getByRole('button'))
    expect(screen.getByText('unsaved:true')).toBeInTheDocument()

    await waitFor(
      () => {
        expect(fsApiMock.applyBufferUpdate).toHaveBeenCalled()
      },
      { timeout: 2000 },
    )

    await act(async () => {
      eventHandlers.get('fs-buffer-status')?.({
        payload: {
          path: 'notes/current.md',
          revision: 1,
          dirty: true,
        },
      })
    })

    expect(screen.getByText('unsaved:true')).toBeInTheDocument()

    await act(async () => {
      resolveUpdate?.({
        kind: 'applied',
        path: 'notes/current.md',
        revision: 1,
        dirty: true,
        session_generation: 3,
      })
    })

    expect(await screen.findByText('saving:true')).toBeInTheDocument()
  })

  it('keeps local unsaved content when switching away and back before sync', async () => {
    const user = userEvent.setup()
    render(<SwitchingHarness />)

    expect(await screen.findByText('saved:false')).toBeInTheDocument()
    expect(screen.getByTestId('value')).toHaveTextContent('initial')

    await user.click(screen.getByRole('button', { name: 'edit' }))
    expect(screen.getByTestId('value')).toHaveTextContent('changed')
    expect(screen.getByTestId('state')).toHaveTextContent('saving:true')

    await user.click(screen.getByRole('button', { name: 'other' }))
    expect(await screen.findByText('saved:false')).toBeInTheDocument()
    expect(screen.getByTestId('active')).toHaveTextContent('notes/other.md')
    expect(screen.getByTestId('value')).toHaveTextContent('other')

    await user.click(screen.getByRole('button', { name: 'current' }))
    expect(screen.getByTestId('active')).toHaveTextContent('notes/current.md')
    expect(screen.getByTestId('value')).toHaveTextContent('changed')
    expect(screen.getByTestId('state')).toHaveTextContent('saving:true')
  })

  it('exposes loading state while opening a Markdown file', async () => {
    let resolveOpen: ((content: string) => void) | undefined
    fsApiMock.openFile.mockReturnValue(
      new Promise((resolve) => {
        resolveOpen = resolve
      }),
    )

    render(<LoadingHarness />)

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('true')
    })

    await act(async () => {
      resolveOpen?.('loaded markdown')
    })

    expect(await screen.findByText('loaded markdown')).toBeInTheDocument()
    expect(screen.getByTestId('loading')).toHaveTextContent('false')
  })
})
