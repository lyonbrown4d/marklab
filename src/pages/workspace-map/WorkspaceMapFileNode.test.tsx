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
    expect(document.querySelector('[data-slate-editor="true"]')).toBeNull()
    expect(document.querySelector('.react-flow__resize-control')).toBeNull()

    const disclosure = screen.getByRole('button', { name: 'workspaceMap.expandNode' })
    fireEvent.pointerDown(disclosure)
    fireEvent.click(disclosure)
    expect(toggle).toHaveBeenCalledExactlyOnceWith('file:notes/a.md')
    expect(parentClick).not.toHaveBeenCalled()
    expect(parentPointerDown).not.toHaveBeenCalled()
  })

  it('renders a safe lightweight Plate document while remaining draggable when inactive', () => {
    renderNode({
      content:
        '# Project goals\n\nThe **next concrete** milestone with <kbd>Ctrl</kbd>.<br>\n\n$x^2$ has a note[^1].\n\n$$\ny = 2\n$$\n\n- Plan\n- Ship\n\n[Remote](https://example.com) ![Diagram](https://example.com/diagram.png)\n\n[^1]: Source\n\n<script>alert(1)</script>',
      label: 'a',
      path: 'notes/a.md',
    })

    const surface = screen.getByTestId('workspace-map-editor-surface')
    const preview = screen.getByTestId('workspace-map-document-preview')
    expect(surface).not.toHaveClass('nodrag')
    expect(surface).toHaveClass('cursor-grab', 'active:cursor-grabbing')
    expect(surface).toHaveClass('overflow-visible')
    expect(screen.getByTestId('workspace-map-resource-drag-handle')).toHaveTextContent('a')
    expect(surface.querySelector('.react-flow__resize-control')).toBeNull()
    expect(screen.getByTestId('workspace-map-editor-content')).toHaveClass('overflow-hidden')
    expect(screen.getByRole('heading', { level: 1, name: 'Project goals' })).toBeInTheDocument()
    expect(screen.getByText('next concrete').closest('strong')).toBeInTheDocument()
    expect(screen.getByText('Ctrl').closest('kbd')).toBeInTheDocument()
    expect(preview.querySelectorAll('.katex')).toHaveLength(2)
    expect(preview.querySelector('.katex-display')).not.toBeNull()
    expect(screen.getAllByRole('math')).toHaveLength(2)
    expect(screen.getByRole('math', { name: 'x^2' })).not.toBeNull()
    expect(screen.getByRole('math', { name: 'y = 2' })).not.toBeNull()
    expect(screen.getByRole('doc-footnote', { name: '[^1]' })).toHaveTextContent('[1]Source')
    expect(screen.getByRole('list')).toHaveTextContent('PlanShip')
    expect(preview).toHaveAttribute('data-slate-editor', 'true')
    expect(preview.querySelector('br')).not.toBeNull()
    expect(document.querySelector('script')).not.toBeInTheDocument()
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(document.querySelector('img')).toBeNull()
    expect(screen.getByText('Remote')).toBeInTheDocument()
    expect(screen.getByText('Diagram')).toBeInTheDocument()
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
    expect(surface).not.toHaveClass('cursor-grab', 'active:cursor-grabbing')
    expect(surface).not.toHaveClass('nodrag', 'nopan')
    expect(screen.getByTestId('workspace-map-editor-content')).toHaveClass('nodrag', 'cursor-text')
    expect(screen.getByTestId('workspace-map-editor-content')).not.toHaveClass('nopan', 'nowheel')
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
