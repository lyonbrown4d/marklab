import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsGraph } from '@/services/fsApi'
import { useWorkspaceStore } from '@/store/useWorkspaceStore'
import { workspaceMapNavigationStore } from '@/utils/workspaceMapNavigation'
import { DocumentRelationsGraph } from '@/components/DocumentRelationsGraph'
import i18n from '@/i18n/setup'

const { getWorkspaceGraph } = vi.hoisted(() => ({ getWorkspaceGraph: vi.fn() }))
vi.mock('@/services/fsApi', () => ({ fsApi: { getWorkspaceGraph } }))
vi.mock('@/components/knowledge/KnowledgeNodePreview', () => ({
  KnowledgeNodePreview: () => <p>Document summary</p>,
}))
vi.mock('@/features/knowledge-graph/KnowledgeGraphCanvas', () => ({
  KnowledgeGraphCanvas: ({
    onSelectNode,
    onOpenNode,
  }: {
    onSelectNode: (id: string) => void
    onOpenNode: (id: string) => void
  }) => (
    <>
      <button onClick={() => onSelectNode('file:linked.md')}>Select linked</button>
      <button onClick={() => onSelectNode('missing:lost')}>Select missing</button>
      <button onClick={() => onOpenNode('missing:lost')}>Activate missing</button>
    </>
  ),
}))
const graph: FsGraph = {
  mode: 'relations',
  revision: 'r1',
  topology_key: 't1',
  truncated: false,
  total_nodes: 2,
  total_edges: 0,
  nodes: [
    {
      id: 'file:linked.md',
      position: { x: 0, y: 0 },
      kind: 'file',
      label: 'Linked',
      path: 'linked.md',
      group: { key: '', label: '', source: 'path' },
    },
    {
      id: 'missing:lost',
      position: { x: 200, y: 0 },
      kind: 'missing',
      label: 'Lost',
      path: 'lost.md',
      source_path: 'current.md',
      target: 'lost.md',
      preview_kind: 'source',
    },
  ],
  edges: [],
}
const mount = () => {
  const onOpenFile = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DocumentRelationsGraph
          workspaceKey="internal:/workspace"
          targetPath="current.md"
          onOpenFile={onOpenFile}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return onOpenFile
}
beforeEach(async () => {
  useWorkspaceStore.setState({ rootKind: 'internal', rootPath: '/workspace' })
  workspaceMapNavigationStore.setState({ request: null })
  getWorkspaceGraph.mockReset()
  await i18n.changeLanguage('en-US')
})

describe('document relation graph', () => {
  it('shows loading and request failure, then recovers to an explicit empty result', async () => {
    let reject: (error: Error) => void = () => undefined
    getWorkspaceGraph.mockImplementationOnce(
      () =>
        new Promise<FsGraph>((_, fail) => {
          reject = fail
        }),
    )
    mount()
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => reject(new Error('offline')))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    getWorkspaceGraph.mockResolvedValue({ ...graph, nodes: [], total_nodes: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText(i18n.t('knowledgeGraph.emptyRelations'))).toBeInTheDocument()
  })

  it('selects without navigating, opens only existing targets, and locates the selection in the global graph', async () => {
    getWorkspaceGraph.mockResolvedValue(graph)
    const onOpenFile = mount()
    fireEvent.click(await screen.findByRole('button', { name: 'Select linked' }))
    expect(onOpenFile).not.toHaveBeenCalled()
    expect(screen.getByText('Document summary')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: i18n.t('knowledgeGraph.openDocument') }))
    expect(onOpenFile).toHaveBeenCalledExactlyOnceWith('linked.md')
    fireEvent.click(screen.getByRole('button', { name: i18n.t('knowledgeGraph.locateInGraph') }))
    expect(workspaceMapNavigationStore.getState().request).toMatchObject({
      nodeId: 'file:linked.md',
      workspaceKey: 'internal:/workspace',
    })
    fireEvent.click(screen.getByRole('button', { name: 'Activate missing' }))
    expect(screen.getByText(i18n.t('knowledgeGraph.missingTarget'))).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: i18n.t('knowledgeGraph.openDocument') }),
    ).not.toBeInTheDocument()
    expect(onOpenFile).toHaveBeenCalledTimes(1)
  })
})
