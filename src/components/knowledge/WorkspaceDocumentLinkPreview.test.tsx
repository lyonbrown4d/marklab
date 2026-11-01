import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceDocumentLinkPreview } from '@/components/knowledge/WorkspaceDocumentLinkPreview'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import i18n from '@/i18n/setup'

const keepAlive = vi.hoisted(() => ({ cacheKey: '', active: true }))
vi.mock('keepalive-for-react', () => ({ useKeepAliveContext: () => keepAlive }))

const { pathsExist, getWorkspaceGraph, getWorkspaceGraphNodeDetails } = vi.hoisted(() => ({
  pathsExist: vi.fn(),
  getWorkspaceGraph: vi.fn(),
  getWorkspaceGraphNodeDetails: vi.fn(),
}))
vi.mock('@/services/workspaceTreeApi', () => ({ workspaceTreeApi: { pathsExist } }))
vi.mock('@/services/fsApi', () => ({ fsApi: { getWorkspaceGraph, getWorkspaceGraphNodeDetails } }))

const mount = (onView?: (rerender: () => void) => void) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onOpen = vi.fn()
  const content = () => (
    <QueryClientProvider client={client}>
      <WorkspaceDocumentLinkPreview
        documentPath="notes/current.md"
        target="linked"
        title="Linked note"
        onOpen={onOpen}
      >
        <a href="#linked">Linked note</a>
      </WorkspaceDocumentLinkPreview>
    </QueryClientProvider>
  )
  const view = render(content())
  onView?.(() => view.rerender(content()))
  return onOpen
}
const hover = () =>
  fireEvent.pointerEnter(screen.getByRole('link', { name: 'Linked note' }), {
    pointerType: 'mouse',
  })

beforeEach(async () => {
  keepAlive.cacheKey = ''
  keepAlive.active = true
  useWorkspaceStore.setState({ rootKind: 'internal', rootPath: '/workspace' })
  pathsExist.mockReset().mockResolvedValue({
    root: { kind: 'internal', path: '/workspace' },
    existing: ['notes/linked.md'],
  })
  getWorkspaceGraph.mockReset().mockResolvedValue({ revision: 'r1' })
  getWorkspaceGraphNodeDetails.mockReset().mockResolvedValue({
    items: [
      {
        id: 'file:notes/linked.md',
        content: 'Linked summary',
        preview: { html: '<p>Safe linked summary</p>', math: [] },
      },
    ],
    revision: 'r1',
    truncated: false,
  })
  await i18n.changeLanguage('en-US')
})

describe('Markdown document link preview', () => {
  it('requests a bounded native summary on hover and opens only through the explicit action', async () => {
    const onOpen = mount()
    expect(pathsExist).not.toHaveBeenCalled()
    hover()
    expect(await screen.findByText('Safe linked summary')).toBeInTheDocument()
    expect(getWorkspaceGraph).toHaveBeenCalledExactlyOnceWith({
      center_path: 'notes/linked.md',
      depth: 1,
      direction: 'both',
      include_attachments: false,
      include_missing: false,
      max_nodes: 1,
      max_edges: 1,
    })
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('knowledgeGraph.openDocument') }))
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('keeps unresolved targets closed and shows lookup failures explicitly', async () => {
    pathsExist.mockResolvedValueOnce({
      root: { kind: 'internal', path: '/workspace' },
      existing: [],
    })
    const onOpen = mount()
    hover()
    expect(await screen.findByText(i18n.t('knowledgeGraph.missingTarget'))).toBeInTheDocument()
    expect(getWorkspaceGraph).not.toHaveBeenCalled()
    expect(
      screen.queryByRole('button', { name: i18n.t('knowledgeGraph.openDocument') }),
    ).not.toBeInTheDocument()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('unmounts a portaled preview and stops its pending lookup when the cached route becomes hidden', async () => {
    keepAlive.cacheKey = 'notes/current.md'
    let finishLookup: (value: {
      root: { kind: string; path: string }
      existing: string[]
    }) => void = () => undefined
    pathsExist.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishLookup = resolve
        }),
    )
    let refresh: () => void = () => undefined
    mount((rerender) => {
      refresh = rerender
    })
    hover()
    await waitFor(() => expect(pathsExist).toHaveBeenCalledOnce())
    expect(screen.getByRole('status')).toHaveTextContent(i18n.t('knowledgeGraph.loadingPreview'))
    keepAlive.active = false
    refresh()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    await act(async () =>
      finishLookup({
        root: { kind: 'internal', path: '/workspace' },
        existing: ['notes/linked.md'],
      }),
    )
    expect(getWorkspaceGraph).not.toHaveBeenCalled()
    expect(screen.queryByText('Safe linked summary')).not.toBeInTheDocument()
  })

  it('shows a failed lookup without reading document details', async () => {
    pathsExist.mockRejectedValueOnce(new Error('workspace unavailable'))
    mount()
    hover()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      i18n.t('knowledgeGraph.previewError'),
    )
    expect(getWorkspaceGraphNodeDetails).not.toHaveBeenCalled()
  })
})
