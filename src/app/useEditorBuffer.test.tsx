import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorBuffer } from '@/app/useEditorBuffer'

const fsApiMock = vi.hoisted(() => ({
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

beforeEach(() => {
  eventHandlers.clear()
  fsApiMock.flushBuffers.mockResolvedValue(0)
  fsApiMock.getBufferStatus.mockResolvedValue({
    path: 'notes/current.md',
    revision: 1,
    dirty: true,
  })
  fsApiMock.openFile.mockImplementation((path: string) =>
    Promise.resolve(path === 'notes/other.md' ? 'other' : 'initial'),
  )
  fsApiMock.updateBuffer.mockResolvedValue({
    path: 'notes/current.md',
    revision: 1,
    dirty: true,
  })
})

afterEach(() => {
  eventHandlers.clear()
})

describe('useEditorBuffer', () => {
  it('keeps a file dirty until the Rust buffer reports a clean flush', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(await screen.findByText('saved:false')).toBeInTheDocument()

    await user.click(screen.getByRole('button'))
    expect(screen.getByText('unsaved:true')).toBeInTheDocument()

    await waitFor(
      () => {
        expect(fsApiMock.updateBuffer).toHaveBeenCalledWith('notes/current.md', 'changed')
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
      ((status: { path: string; revision: number; dirty: boolean }) => void) | undefined
    fsApiMock.updateBuffer.mockReturnValue(
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
        expect(fsApiMock.updateBuffer).toHaveBeenCalledWith('notes/current.md', 'changed')
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
        path: 'notes/current.md',
        revision: 1,
        dirty: true,
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
    expect(screen.getByTestId('state')).toHaveTextContent('unsaved:true')

    await user.click(screen.getByRole('button', { name: 'other' }))
    expect(await screen.findByText('saved:false')).toBeInTheDocument()
    expect(screen.getByTestId('active')).toHaveTextContent('notes/other.md')
    expect(screen.getByTestId('value')).toHaveTextContent('other')

    await user.click(screen.getByRole('button', { name: 'current' }))
    expect(screen.getByTestId('active')).toHaveTextContent('notes/current.md')
    expect(screen.getByTestId('value')).toHaveTextContent('changed')
    expect(screen.getByTestId('state')).toHaveTextContent('unsaved:true')
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
