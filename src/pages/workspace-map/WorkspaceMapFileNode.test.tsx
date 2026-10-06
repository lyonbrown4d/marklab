import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
} from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReactFlowProvider } from '@xyflow/react'
import { WorkspaceMapFileNode } from '@/pages/workspace-map/WorkspaceMapFileNode'
import type { GraphNodeData } from '@/logic/graph'

const editorHarness = vi.hoisted(() => ({ recreateHandle: null as null | (() => void) }))

vi.mock('@/components/MarkdownEditor', () => ({
  default: forwardRef<
    { focus: () => void; generation: number; getMarkdown: () => Promise<string> },
    { autoFocus?: boolean; readOnly?: boolean; value: string }
  >(({ autoFocus, readOnly, value }, forwardedRef) => {
    const editorRef = useRef<HTMLTextAreaElement>(null)
    const [handleGeneration, setHandleGeneration] = useState(0)
    editorHarness.recreateHandle = () => setHandleGeneration((generation) => generation + 1)
    useImperativeHandle(
      forwardedRef,
      () => ({
        focus: () => editorRef.current?.focus(),
        generation: handleGeneration,
        getMarkdown: () => Promise.resolve(value),
      }),
      [handleGeneration, value],
    )
    useEffect(() => {
      if (autoFocus) editorRef.current?.focus()
    }, [autoFocus])
    return (
      <>
        <textarea
          data-testid="plate-editor"
          defaultValue={value}
          readOnly={readOnly}
          ref={editorRef}
        />
        <button type="button">Dialog control</button>
      </>
    )
  }),
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

beforeEach(() => {
  editorHarness.recreateHandle = null
  editor.onClose.mockClear()
  editor.onOpenFull.mockClear()
  editor.onRetry.mockClear()
})

describe('WorkspaceMapFileNode', () => {
  it('unmounts document content and keeps disclosure events inside a collapsed node', () => {
    const toggle = vi.fn()
    const parentClick = vi.fn()
    const parentPointerDown = vi.fn()
    renderNode(
      {
        content: 'Heavy document content',
        label: 'a',
        path: 'notes/a.md',
        workspaceMapDisclosure: { collapsed: true, toggle },
      },
      { onClick: parentClick, onPointerDown: parentPointerDown },
    )

    expect(screen.getByText('Heavy document content')).toBeInTheDocument()
    expect(screen.queryByTestId('workspace-map-editor-content')).not.toBeInTheDocument()
    expect(document.querySelector('.react-flow__resize-control')).toBeNull()

    const disclosure = screen.getByRole('button', { name: 'workspaceMap.expandNode' })
    fireEvent.pointerDown(disclosure)
    fireEvent.click(disclosure)
    expect(toggle).toHaveBeenCalledExactlyOnceWith('file:notes/a.md')
    expect(parentClick).not.toHaveBeenCalled()
    expect(parentPointerDown).not.toHaveBeenCalled()
  })

  it('renders a safe lightweight document summary while remaining draggable when inactive', () => {
    renderNode({
      content: 'Project goals and the next concrete milestone. <script>alert(1)</script>',
      label: 'a',
      path: 'notes/a.md',
    })

    const surface = screen.getByTestId('workspace-map-editor-surface')
    expect(surface).not.toHaveClass('nodrag')
    expect(surface).toHaveClass('overflow-visible')
    expect(screen.getByTestId('workspace-map-resource-drag-handle')).toHaveTextContent('a')
    expect(surface.querySelector('.react-flow__resize-control')).toBeNull()
    expect(screen.getByTestId('workspace-map-editor-content')).toHaveClass('overflow-hidden')
    expect(screen.getByText(/Project goals and the next concrete milestone/)).toBeInTheDocument()
    expect(document.querySelector('script')).not.toBeInTheDocument()
    expect(screen.queryByTestId('plate-editor')).not.toBeInTheDocument()
  })

  it('keeps one page surface mounted and activates one native editor in place', async () => {
    const view = renderNode({ label: 'a', path: 'notes/a.md' })
    const surface = screen.getByTestId('workspace-map-editor-surface')

    expect(screen.queryByTestId('plate-editor')).not.toBeInTheDocument()
    expect(surface).toHaveAttribute('data-editor-active', 'false')

    view.rerender(
      <div>
        <WorkspaceMapFileNode
          {...nodeProps({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor })}
        />
      </div>,
    )

    expect(screen.getByTestId('workspace-map-editor-surface')).toBe(surface)
    const plateEditor = await screen.findByTestId('plate-editor')
    expect(plateEditor).not.toHaveAttribute('readonly')
    expect(surface).toHaveAttribute('data-editor-active', 'true')
    expect(surface).not.toHaveClass('nodrag', 'nopan')
    expect(screen.getByTestId('workspace-map-editor-content')).toHaveClass('nodrag', 'nopan')
    expect(surface.querySelector('.react-flow__resize-control')).not.toBeNull()
    const viewport = screen.getByTestId('workspace-map-editor-viewport')
    expect(viewport).toHaveClass('absolute', 'inset-0', 'overflow-hidden')
    expect(viewport).toHaveClass('[contain:strict]')
    await waitFor(() => expect(plateEditor).toHaveFocus())
  })

  it('keeps the lightweight page surface mounted while the document loads', () => {
    renderNode({
      label: 'a',
      path: 'notes/a.md',
      workspaceMapEditor: {
        ...editor,
        loadState: { status: 'loading' },
      },
    })

    expect(screen.getByText('workspaceMap.loadingDocument')).toBeInTheDocument()
    expect(screen.queryByTestId('plate-editor')).not.toBeInTheDocument()
  })

  it('shows an actionable load error without mounting Plate', () => {
    renderNode({
      label: 'a',
      path: 'notes/a.md',
      workspaceMapEditor: {
        ...editor,
        loadState: { status: 'error', message: 'disk unavailable' },
      },
    })

    expect(screen.getByRole('alert')).toHaveTextContent('disk unavailable')
    expect(screen.queryByTestId('plate-editor')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'workspaceMap.retry' }))
    expect(editor.onRetry).toHaveBeenCalledOnce()
  })

  it('mounts Plate for a successfully loaded empty document', async () => {
    renderNode({
      label: 'empty',
      path: 'notes/empty.md',
      workspaceMapEditor: {
        ...editor,
        loadState: { status: 'ready', content: '' },
      },
    })

    expect(await screen.findByTestId('plate-editor')).toBeInTheDocument()
  })

  it('keeps an active editor expanded even if stale disclosure state says collapsed', async () => {
    renderNode({
      label: 'a',
      path: 'notes/a.md',
      workspaceMapDisclosure: { collapsed: true, toggle: vi.fn() },
      workspaceMapEditor: editor,
    })

    expect(await screen.findByTestId('plate-editor')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'workspaceMap.expandNode' }),
    ).not.toBeInTheDocument()
  })

  it('uses the filename strip only for dragging while the document body stays directly editable', () => {
    renderNode({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor })

    expect(screen.getByTestId('workspace-map-resource-drag-handle')).toHaveTextContent('a')
    expect(screen.queryByRole('button', { name: 'workspaceMap.closeEditor' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'workspaceMap.openFullDocument' })).toBeNull()
    expect(screen.getByTestId('workspace-map-editor-content')).toContainElement(
      screen.getByTestId('plate-editor'),
    )
  })

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
    fireEvent.keyDown(surface, { key: 'Escape', keyCode: 229 })

    expect(editor.onClose).not.toHaveBeenCalled()
  })

  it('keeps document scrolling local but lets modified wheel gestures reach canvas zoom', () => {
    const parentHandlers = {
      onClick: vi.fn(),
      onDoubleClick: vi.fn(),
      onKeyDown: vi.fn(),
      onWheel: vi.fn(),
    }
    renderNode({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor }, parentHandlers)
    const content = screen.getByTestId('workspace-map-editor-content')
    fireEvent.click(content)
    fireEvent.doubleClick(content)
    fireEvent.keyDown(content, { key: 'b' })
    fireEvent.wheel(content, { deltaY: 40 })

    expect(parentHandlers.onClick).not.toHaveBeenCalled()
    expect(parentHandlers.onDoubleClick).not.toHaveBeenCalled()
    expect(parentHandlers.onKeyDown).not.toHaveBeenCalled()
    expect(parentHandlers.onWheel).not.toHaveBeenCalled()

    fireEvent.wheel(content, { ctrlKey: true, deltaY: -40 })
    fireEvent.wheel(content, { deltaY: -40, metaKey: true })
    expect(parentHandlers.onWheel).toHaveBeenCalledTimes(2)
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

  it('does not steal focus when Plate recreates its imperative handle', async () => {
    renderNode({ label: 'a', path: 'notes/a.md', workspaceMapEditor: editor })
    const plateEditor = await screen.findByTestId('plate-editor')
    await waitFor(() => expect(plateEditor).toHaveFocus())
    const dialogControl = screen.getByRole('button', { name: 'Dialog control' })

    dialogControl.focus()
    expect(dialogControl).toHaveFocus()
    act(() => editorHarness.recreateHandle?.())

    await waitFor(() => expect(dialogControl).toHaveFocus())
  })
})
