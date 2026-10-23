import { act, fireEvent, render as renderComponent, screen, waitFor } from '@testing-library/react'
import { forwardRef, useImperativeHandle, type ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownEditorHandle } from '@/components/editor/markdownEditorTypes'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import type { WorkspaceTreeExistenceResult } from '@/types/workspaceTree'

const { pathsExist, errorToast } = vi.hoisted(() => ({ pathsExist: vi.fn(), errorToast: vi.fn() }))
vi.mock('@/services/workspaceTreeApi', () => ({ workspaceTreeApi: { pathsExist } }))
vi.mock('sonner', () => ({ toast: { error: errorToast } }))

const existence = (existing: string[]): WorkspaceTreeExistenceResult => ({
  existing,
  generation: 1,
  revision: 1,
  root: { kind: 'internal', path: '/workspace' },
})
const render = (ui: ReactElement) => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return renderComponent(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}
beforeEach(() => {
  pathsExist.mockReset().mockResolvedValue(existence([]))
  errorToast.mockReset()
  useWorkspaceStore.setState({
    rootKind: 'internal',
    rootPath: '/workspace',
    treeGeneration: 1,
    treeRevision: 1,
  })
})

vi.mock('@/components/MarkdownEditor', () => ({
  default: forwardRef<
    MarkdownEditorHandle,
    {
      activePath: string | null
      onWorkspaceLink?: (target: string, documentPath: string | null) => void
    }
  >(({ activePath, onWorkspaceLink }, ref) => {
    useImperativeHandle(ref, () => ({
      focus: vi.fn(),
      getMarkdown: async () => '',
    }))
    return (
      <>
        <button
          type="button"
          onClick={() => onWorkspaceLink?.('User%20Guide/00-Start-Here.md', activePath)}
        >
          Open guide
        </button>
        <button
          type="button"
          onClick={() => onWorkspaceLink?.('architecture-overview', 'notes/current.md')}
        >
          Open architecture
        </button>
        <button type="button" onClick={() => onWorkspaceLink?.('missing-page', 'notes/current.md')}>
          Open missing
        </button>
        <button
          type="button"
          onClick={() => onWorkspaceLink?.('../src/example.ts', 'notes/current.md')}
        >
          Open source
        </button>
        <button
          type="button"
          onClick={() => onWorkspaceLink?.('../docs/spec.pdf', 'notes/current.md')}
        >
          Open PDF
        </button>
      </>
    )
  }),
}))

import WysiwygEditorPage from '@/pages/WysiwygEditorPage'

describe('WysiwygEditorPage workspace links', () => {
  it('identifies the rendered editor with its document path', () => {
    const { container } = render(
      <WysiwygEditorPage
        activePath="notes/current.md"
        files={[]}
        onChange={vi.fn()}
        onOpenFile={vi.fn()}
        readOnly={false}
        showStatusBar={false}
        value="Current document"
      />,
    )

    expect(container.firstElementChild).toHaveAttribute(
      'data-editor-document-path',
      'notes/current.md',
    )
  })

  it('opens an indexed extensionless Markdown target and ignores a missing target', async () => {
    const onOpenFile = vi.fn()
    const onOpenFileView = vi.fn()
    const files = [
      { kind: 'file' as const, path: 'notes/current.md' },
      { kind: 'file' as const, path: 'notes/architecture-overview.md' },
      { kind: 'file' as const, path: 'src/example.ts' },
      { kind: 'file' as const, path: 'docs/spec.pdf' },
    ]
    render(
      <WysiwygEditorPage
        activePath="notes/current.md"
        files={files}
        onChange={vi.fn()}
        onOpenFile={onOpenFile}
        onOpenFileView={onOpenFileView}
        readOnly={false}
        showStatusBar={false}
        value="[Architecture](architecture-overview)"
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Open architecture' }))
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('notes/architecture-overview.md')
    expect(pathsExist).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Open missing' }))
    expect(onOpenFile).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Open source' }))
    expect(onOpenFileView).toHaveBeenCalledWith('src/example.ts', 'source')

    fireEvent.click(screen.getByRole('button', { name: 'Open PDF' }))
    expect(onOpenFile).toHaveBeenCalledWith('docs/spec.pdf')
  })
})

describe('WysiwygEditorPage unloaded links', () => {
  const page = (
    onOpenFile = vi.fn(),
    activePath = 'Home.md',
    workspaceKey = 'internal:/workspace',
  ) => (
    <WysiwygEditorPage
      activePath={activePath}
      workspaceKey={workspaceKey}
      files={[
        { kind: 'file', path: activePath },
        { kind: 'folder', path: 'User Guide' },
      ]}
      onChange={vi.fn()}
      onOpenFile={onOpenFile}
      readOnly={false}
      showStatusBar={false}
      value="[Guide](User%20Guide/00-Start-Here.md)"
    />
  )
  const deferred = () => {
    let resolve!: (result: WorkspaceTreeExistenceResult) => void
    const promise = new Promise<WorkspaceTreeExistenceResult>((done) => {
      resolve = done
    })
    return { promise, resolve }
  }

  it('opens a file in a collapsed folder with one bounded existence check and shows pending state', async () => {
    const request = deferred()
    pathsExist.mockReturnValue(request.promise)
    const onOpenFile = vi.fn()
    const { container } = render(page(onOpenFile))
    fireEvent.click(await screen.findByRole('button', { name: 'Open guide' }))
    await waitFor(() => expect(container.firstElementChild).toHaveAttribute('aria-busy', 'true'))
    expect(screen.getByRole('status')).toBeInTheDocument()
    expect(pathsExist).toHaveBeenCalledExactlyOnceWith({
      kind: 'file',
      paths: ['User Guide/00-Start-Here.md'],
    })
    await act(async () => request.resolve(existence(['User Guide/00-Start-Here.md'])))
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('User Guide/00-Start-Here.md')
    await waitFor(() => expect(container.firstElementChild).toHaveAttribute('aria-busy', 'false'))
  })

  it('reports a missing file without navigating', async () => {
    const onOpenFile = vi.fn()
    render(page(onOpenFile))
    fireEvent.click(await screen.findByRole('button', { name: 'Open guide' }))
    await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1))
    expect(onOpenFile).not.toHaveBeenCalled()
  })

  it('handles a failed existence request without navigating', async () => {
    pathsExist.mockRejectedValue(new Error('Unavailable'))
    const onOpenFile = vi.fn()
    render(page(onOpenFile))
    fireEvent.click(await screen.findByRole('button', { name: 'Open guide' }))
    await waitFor(() => expect(errorToast).toHaveBeenCalledTimes(1))
    expect(onOpenFile).not.toHaveBeenCalled()
  })

  it.each(['workspace', 'document', 'generation', 'revision', 'unmount'])(
    'ignores a delayed result after %s changes',
    async (change) => {
      const request = deferred()
      pathsExist.mockReturnValue(request.promise)
      const onOpenFile = vi.fn()
      const view = render(page(onOpenFile))
      fireEvent.click(await screen.findByRole('button', { name: 'Open guide' }))
      await waitFor(() => expect(pathsExist).toHaveBeenCalledTimes(1))
      if (change === 'workspace') {
        useWorkspaceStore.setState({ rootPath: '/other', treeGeneration: 2 })
        view.rerender(page(onOpenFile, 'Home.md', 'internal:/other'))
      } else if (change === 'document') view.rerender(page(onOpenFile, 'Other.md'))
      else if (change === 'generation') useWorkspaceStore.setState({ treeGeneration: 2 })
      else if (change === 'revision') useWorkspaceStore.setState({ treeRevision: 2 })
      else view.unmount()
      await act(async () => request.resolve(existence(['User Guide/00-Start-Here.md'])))
      expect(onOpenFile).not.toHaveBeenCalled()
      expect(errorToast).not.toHaveBeenCalled()
    },
  )

  it.each(['rootPath', 'rootKind', 'generation', 'revision'])(
    'rejects response %s mismatch',
    async (field) => {
      const response = existence(['User Guide/00-Start-Here.md'])
      if (field === 'rootPath') response.root.path = '/other'
      else if (field === 'rootKind') response.root.kind = 'external'
      else if (field === 'generation') response.generation = 2
      else response.revision = 2
      pathsExist.mockResolvedValue(response)
      const onOpenFile = vi.fn()
      render(page(onOpenFile))
      fireEvent.click(await screen.findByRole('button', { name: 'Open guide' }))
      await waitFor(() => expect(pathsExist).toHaveBeenCalledTimes(1))
      await act(async () => {})
      expect(onOpenFile).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['Open source', 'src/example.ts', 'source'],
    ['Open PDF', 'docs/spec.pdf', 'edit'],
    ['Open architecture', 'notes/architecture-overview.md', 'edit'],
  ])('preserves navigation for unloaded %s targets', async (button, path, view) => {
    pathsExist.mockResolvedValue(existence([path]))
    const onOpenFile = vi.fn()
    const onOpenFileView = vi.fn()
    render(
      <WysiwygEditorPage
        activePath="notes/current.md"
        files={[]}
        onChange={vi.fn()}
        onOpenFile={onOpenFile}
        onOpenFileView={onOpenFileView}
        value="Links"
        readOnly={false}
        showStatusBar={false}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: button }))
    await waitFor(() => expect(view === 'source' ? onOpenFileView : onOpenFile).toHaveBeenCalled())
    if (view === 'source') expect(onOpenFileView).toHaveBeenCalledExactlyOnceWith(path, 'source')
    else expect(onOpenFile).toHaveBeenCalledExactlyOnceWith(path)
    expect(pathsExist.mock.calls[0][0].paths).toHaveLength(3)
    expect(pathsExist.mock.calls[0][0].kind).toBe('file')
  })

  it('ignores an earlier lookup after a newer link is clicked', async () => {
    const first = deferred()
    const second = deferred()
    pathsExist.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const onOpenFile = vi.fn()
    render(page(onOpenFile))
    const button = await screen.findByRole('button', { name: 'Open guide' })
    fireEvent.click(button)
    fireEvent.click(button)
    await act(async () => first.resolve(existence(['User Guide/00-Start-Here.md'])))
    expect(onOpenFile).not.toHaveBeenCalled()
    await act(async () => second.resolve(existence(['User Guide/00-Start-Here.md'])))
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('User Guide/00-Start-Here.md')
  })
})
