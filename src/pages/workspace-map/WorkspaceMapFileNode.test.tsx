import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkspaceMapFileNode } from '@/pages/workspace-map/WorkspaceMapFileNode'
import type { GraphNodeData } from '@/logic/graph'

vi.mock('@/components/MarkdownEditor', () => ({
  default: () => <div data-testid="milkdown-editor" />,
}))

vi.mock('@/components/milkdown/useSlashCommandLabels', () => ({
  useSlashCommandLabels: () => ({}),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}))

const editor = {
  active: true as const,
  loadState: { status: 'ready' as const, content: '# Note' },
  onChange: vi.fn(),
  onClose: vi.fn(),
  onOpenFull: vi.fn(),
  onRetry: vi.fn(),
  readOnly: false,
}

const nodeProps = (data: GraphNodeData) =>
  ({ id: 'file:notes/a.md', data, selected: false }) as unknown as ComponentProps<
    typeof WorkspaceMapFileNode
  >

const renderNode = (data: GraphNodeData, parentHandlers = {}) =>
  render(
    <div {...parentHandlers}>
      <WorkspaceMapFileNode {...nodeProps(data)} />
    </div>,
    { wrapper: ReactFlowProvider },
  )

beforeEach(() => {
  editor.onClose.mockClear()
  editor.onOpenFull.mockClear()
  editor.onRetry.mockClear()
})

describe('WorkspaceMapFileNode', () => {
  it('mounts exactly one real editor only for the active file node', async () => {
    const view = renderNode({ label: 'a', path: 'notes/a.md' })
    expect(screen.queryByTestId('milkdown-editor')).not.toBeInTheDocument()

    view.rerender(
      <ReactFlowProvider>
        <WorkspaceMapFileNode
          {...nodeProps({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor })}
        />
      </ReactFlowProvider>,
    )
    expect(await screen.findAllByTestId('milkdown-editor')).toHaveLength(1)
  })

  it('does not mount Milkdown while the document is still loading', () => {
    renderNode({
      label: 'a',
      path: 'notes/a.md',
      workspaceMapEditor: {
        ...editor,
        loadState: { status: 'loading' },
      },
    })

    expect(screen.getByText('workspaceMap.loadingDocument')).toBeInTheDocument()
    expect(screen.queryByTestId('milkdown-editor')).not.toBeInTheDocument()
  })

  it('shows an actionable load error without mounting Milkdown', () => {
    renderNode({
      label: 'a',
      path: 'notes/a.md',
      workspaceMapEditor: {
        ...editor,
        loadState: { status: 'error', message: 'disk unavailable' },
      },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('disk unavailable')
    expect(screen.queryByTestId('milkdown-editor')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.retry' }))
    expect(editor.onRetry).toHaveBeenCalledOnce()
  })

  it('mounts Milkdown for a successfully loaded empty document', async () => {
    renderNode({
      label: 'empty',
      path: 'notes/empty.md',
      workspaceMapEditor: {
        ...editor,
        loadState: { status: 'ready', content: '' },
      },
    })

    expect(await screen.findByTestId('milkdown-editor')).toBeInTheDocument()
  })

  it('closes or opens the full document only through explicit header buttons', () => {
    renderNode({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor })

    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.closeEditor' }))
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.openFullDocument' }))

    expect(editor.onClose).toHaveBeenCalledOnce()
    expect(editor.onOpenFull).toHaveBeenCalledOnce()
  })

  it('isolates editor pointer, wheel, double-click, and keyboard events from the graph', () => {
    const parentHandlers = {
      onClick: vi.fn(),
      onDoubleClick: vi.fn(),
      onKeyDown: vi.fn(),
      onWheel: vi.fn(),
    }
    renderNode({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor }, parentHandlers)
    const surface = screen.getByTestId('workspace-map-editor-surface')

    fireEvent.click(surface)
    fireEvent.doubleClick(surface)
    fireEvent.keyDown(surface, { key: 'b' })
    fireEvent.wheel(surface)

    expect(parentHandlers.onClick).not.toHaveBeenCalled()
    expect(parentHandlers.onDoubleClick).not.toHaveBeenCalled()
    expect(parentHandlers.onKeyDown).not.toHaveBeenCalled()
    expect(parentHandlers.onWheel).not.toHaveBeenCalled()
  })
})
