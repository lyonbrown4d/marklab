import { fireEvent, render, screen } from '@testing-library/react'
import { type ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReactFlowProvider } from '@xyflow/react'
import type { GraphNodeData } from '@/logic/graph'
import { WorkspaceMapFileNode } from '@/pages/workspace-map/WorkspaceMapFileNode'

vi.mock('@/components/MarkdownEditor', () => ({
  default: ({ readOnly, value }: { readOnly?: boolean; value: string }) => (
    <textarea data-testid="plate-editor" defaultValue={value} readOnly={readOnly} />
  ),
}))
vi.mock('@/components/editor/useMarkdownEditorSlashLabels', () => ({
  useMarkdownEditorSlashLabels: () => ({}),
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

describe('WorkspaceMapFileNode interactions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('closes the active editor with Escape without bubbling to the graph', () => {
    const onKeyDown = vi.fn()
    renderNode({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor }, { onKeyDown })

    fireEvent.keyDown(screen.getByTestId('workspace-map-editor-content'), { key: 'Escape' })

    expect(editor.onClose).toHaveBeenCalledOnce()
    expect(onKeyDown).not.toHaveBeenCalled()
  })

  it('does not close the editor when Escape belongs to IME composition', () => {
    renderNode({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor })
    const surface = screen.getByTestId('workspace-map-editor-surface')

    fireEvent.keyDown(surface, { isComposing: true, key: 'Escape' })
    fireEvent.keyDown(surface, { key: 'Process' })

    expect(editor.onClose).not.toHaveBeenCalled()
  })

  it('keeps document scrolling local but lets modified wheel gestures reach canvas zoom', () => {
    const parentHandlers = {
      onClick: vi.fn(),
      onDoubleClick: vi.fn(),
      onKeyDown: vi.fn(),
      onWheel: vi.fn(),
    }
    const view = renderNode(
      { label: 'a', path: 'notes/a.md', workspaceMapEditor: editor },
      parentHandlers,
    )
    const content = screen.getByTestId('workspace-map-editor-content')
    const nativeCanvasWheel = vi.fn()
    view.container.firstElementChild?.addEventListener('wheel', nativeCanvasWheel)
    fireEvent.click(content)
    fireEvent.doubleClick(content)
    fireEvent.keyDown(content, { key: 'b' })
    fireEvent.wheel(content, { deltaY: 40 })

    expect(parentHandlers.onClick).not.toHaveBeenCalled()
    expect(parentHandlers.onDoubleClick).not.toHaveBeenCalled()
    expect(parentHandlers.onKeyDown).not.toHaveBeenCalled()
    expect(parentHandlers.onWheel).not.toHaveBeenCalled()
    expect(nativeCanvasWheel).not.toHaveBeenCalled()

    fireEvent.wheel(content, { ctrlKey: true, deltaY: -40 })
    fireEvent.wheel(content, { deltaY: -40, metaKey: true })
    expect(parentHandlers.onWheel).toHaveBeenCalledTimes(2)
    expect(nativeCanvasWheel).toHaveBeenCalledTimes(2)
  })

  it('lets inactive preview pointer and wheel gestures reach the canvas', () => {
    const parentHandlers = { onPointerDown: vi.fn(), onWheel: vi.fn() }
    renderNode({ label: 'a', path: 'notes/a.md' }, parentHandlers)
    const surface = screen.getByTestId('workspace-map-editor-surface')

    fireEvent.pointerDown(surface)
    fireEvent.wheel(surface, { deltaY: 40 })

    expect(surface).not.toHaveClass('nopan')
    expect(parentHandlers.onPointerDown).toHaveBeenCalledOnce()
    expect(parentHandlers.onWheel).toHaveBeenCalledOnce()
  })
})
