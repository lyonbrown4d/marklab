import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PlateElementProps } from 'platejs/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dndMocks = vi.hoisted(() => ({
  dropLine: '' as '' | 'bottom' | 'top',
  handleRef: vi.fn(),
  nodeRef: { current: null },
}))

const editorMocks = vi.hoisted(() => ({
  findPath: vi.fn((element: { id?: string }) => {
    const index = ['block-1', 'block-2', 'block-3'].indexOf(element.id ?? '')
    return index < 0 ? undefined : [index]
  }),
  setNodes: vi.fn(),
  removeNodes: vi.fn(),
}))

const clipboardMocks = vi.hoisted(() => ({
  writeContent: vi.fn(async () => undefined),
  writeText: vi.fn(async () => undefined),
}))

const blockSelectionMocks = vi.hoisted(() => ({
  deselect: vi.fn(),
  focus: vi.fn(),
  set: vi.fn(),
}))

vi.mock('@platejs/dnd', () => ({
  DndPlugin: {},
  useDraggable: () => ({
    handleRef: dndMocks.handleRef,
    isDragging: false,
    nodeRef: dndMocks.nodeRef,
  }),
  useDropLine: () => ({ dropLine: dndMocks.dropLine }),
}))

vi.mock('@platejs/selection/react', () => ({
  BlockSelectionPlugin: {},
  useBlockSelected: () => false,
}))

vi.mock('@/components/plate/plateClipboardSerialization', () => ({
  serializePlateBlockClipboard: () => ({
    html: '<p>Block</p>',
    markdown: '**Block**',
    text: 'Block',
  }),
}))

vi.mock('@/runtime/clipboard', () => ({
  writeClipboardContent: clipboardMocks.writeContent,
  writeClipboardText: clipboardMocks.writeText,
}))

vi.mock('platejs/react', () => ({
  useEditorRef: () => ({
    api: { findPath: editorMocks.findPath, toDOMNode: () => null },
    children: ['block-1', 'block-2', 'block-3'].map((id) => ({
      children: [{ text: id }],
      id,
      type: 'p',
    })),
    getApi: () => ({ blockSelection: blockSelectionMocks }),
    getOption: () => undefined,
    getOptions: () => ({ selectedIds: new Set<string>() }),
    setOption: vi.fn(),
    tf: {
      insertNodes: vi.fn(),
      moveNodes: vi.fn(),
      removeNodes: editorMocks.removeNodes,
      setNodes: editorMocks.setNodes,
      withNewBatch: (callback: () => void) => callback(),
    },
  }),
}))

import { BlockDraggable } from '@/components/plate/nodes/BlockDraggable'

const renderBlock = () => {
  const props = {
    children: <p>Block content</p>,
    element: { children: [{ text: 'Block' }], id: 'block-1', type: 'p' },
  } as unknown as PlateElementProps

  return render(<BlockDraggable {...props} />)
}

const renderBlocks = () =>
  render(
    <div data-plate-editor-shell="true">
      {['block-1', 'block-2', 'block-3'].map((id) => (
        <BlockDraggable
          key={id}
          {...({
            children: <p>{id}</p>,
            element: { children: [{ text: id }], id, type: 'p' },
          } as unknown as PlateElementProps)}
        />
      ))}
    </div>,
  )

beforeEach(() => {
  dndMocks.dropLine = ''
  dndMocks.handleRef.mockClear()
  editorMocks.setNodes.mockClear()
  editorMocks.removeNodes.mockClear()
  clipboardMocks.writeContent.mockClear()
  clipboardMocks.writeText.mockClear()
  blockSelectionMocks.deselect.mockClear()
  blockSelectionMocks.focus.mockClear()
  blockSelectionMocks.set.mockClear()
})

describe('BlockDraggable', () => {
  it('opens the block action menu on click', async () => {
    renderBlock()

    fireEvent.click(screen.getByRole('button', { name: 'Move block' }))

    expect(await screen.findByRole('menuitem', { name: 'Paragraph' })).toBeVisible()
  })

  it('does not open the menu after a pointer drag', () => {
    renderBlock()
    const handle = screen.getByRole('button', { name: 'Move block' })

    const pointerDown = createEvent.pointerDown(handle)
    fireEvent(handle, pointerDown)
    fireEvent.dragStart(handle)
    fireEvent.click(handle)

    expect(pointerDown.defaultPrevented).toBe(false)
    expect(screen.queryByRole('menuitem', { name: 'Paragraph' })).not.toBeInTheDocument()
  })

  it('opens the block action menu with Enter', async () => {
    renderBlock()
    const handle = screen.getByRole('button', { name: 'Move block' })
    handle.focus()

    fireEvent.keyDown(handle, { key: 'Enter' })

    const firstAction = await screen.findByRole('menuitem', { name: 'Paragraph' })
    expect(firstAction).toBeVisible()
    expect(firstAction).toHaveFocus()
  })

  it('keeps Space routed to block selection', () => {
    renderBlock()
    const handle = screen.getByRole('button', { name: 'Move block' })

    fireEvent.keyDown(handle, { key: ' ' })

    expect(blockSelectionMocks.set).toHaveBeenCalledWith(['block-1'])
    expect(screen.queryByRole('menuitem', { name: 'Paragraph' })).not.toBeInTheDocument()
  })

  it('keeps modified Space routed to block selection shortcuts', () => {
    renderBlock()
    const handle = screen.getByRole('button', { name: 'Move block' })

    fireEvent.keyDown(handle, { ctrlKey: true, key: ' ' })

    expect(blockSelectionMocks.set).toHaveBeenCalledWith(['block-1'])
    expect(screen.queryByRole('menuitem', { name: 'Paragraph' })).not.toBeInTheDocument()
  })

  it('runs a block type transform from the menu', async () => {
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Move block' }))

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Heading 2' }))

    expect(editorMocks.setNodes).toHaveBeenCalledWith({ type: 'h2' }, { at: [0] })
  })

  it('copies a block as rich content or Markdown from the menu', async () => {
    renderBlock()
    const handle = screen.getByRole('button', { name: 'Move block' })

    fireEvent.click(handle)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy' }))
    await waitFor(() =>
      expect(clipboardMocks.writeContent).toHaveBeenCalledWith({
        html: '<p>Block</p>',
        markdown: '**Block**',
        text: 'Block',
      }),
    )

    fireEvent.click(handle)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy as Markdown' }))
    await waitFor(() => expect(clipboardMocks.writeText).toHaveBeenCalledWith('**Block**'))
  })

  it('deletes a block only after its cut content reaches the clipboard', async () => {
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Move block' }))

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cut' }))

    await waitFor(() => expect(editorMocks.removeNodes).toHaveBeenCalledWith({ at: [0] }))
  })

  it('keeps the block when a cut clipboard write fails', async () => {
    clipboardMocks.writeContent.mockRejectedValueOnce(new Error('clipboard unavailable'))
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Move block' }))

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Cut' }))

    await waitFor(() => expect(clipboardMocks.writeContent).toHaveBeenCalled())
    expect(editorMocks.removeNodes).not.toHaveBeenCalled()
  })

  it('disables movement actions at document boundaries', async () => {
    renderBlock()
    fireEvent.click(screen.getByRole('button', { name: 'Move block' }))

    expect(await screen.findByRole('menuitem', { name: 'Move up' })).toHaveAttribute(
      'data-disabled',
    )
    expect(screen.getByRole('menuitem', { name: 'Move down' })).not.toHaveAttribute('data-disabled')
  })

  it('returns focus to the drag handle when the menu closes', async () => {
    renderBlock()
    const handle = screen.getByRole('button', { name: 'Move block' })
    fireEvent.click(handle)
    await screen.findByRole('menuitem', { name: 'Paragraph' })

    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

    await waitFor(() => expect(handle).toHaveFocus())
  })

  it('keeps one drag handle in the Tab order and roves focus with arrow keys', () => {
    renderBlocks()
    const handles = screen.getAllByRole('button', { name: 'Move block' })

    expect(handles.map((handle) => handle.tabIndex)).toEqual([0, -1, -1])

    handles[0].focus()
    fireEvent.keyDown(handles[0], { key: 'ArrowDown' })

    expect(handles[1]).toHaveFocus()
    expect(handles.map((handle) => handle.tabIndex)).toEqual([-1, 0, -1])
  })

  it('keeps the drag source mounted when the pointer leaves the block', () => {
    const { container } = renderBlock()
    const wrapper = container.querySelector<HTMLElement>('[data-block-drag-wrapper="true"]')

    const handle = screen.getByRole('button', { name: 'Move block' })
    fireEvent.pointerLeave(wrapper!)

    expect(handle).toBeInTheDocument()
  })

  it('keeps the drag handle mounted while keyboard focus remains in the block', () => {
    renderBlock()

    const handle = screen.getByRole('button', { name: 'Move block' })
    handle.focus()
    expect(handle).toHaveFocus()

    expect(handle).toBeVisible()
  })

  it('keeps the transparent drag handle inside the block hit-test area', () => {
    const { container } = renderBlock()

    const handle = screen.getByRole('button', { name: 'Move block' })
    const icon = handle.querySelector('svg')
    const wrapper = container.querySelector<HTMLElement>('[data-block-drag-wrapper="true"]')

    expect(wrapper).toHaveClass('pl-8')
    expect(handle).toHaveClass('left-0')
    expect(handle).not.toHaveClass('-left-9')
    expect(handle).not.toHaveClass('pointer-events-none')
    expect(handle).not.toHaveClass('opacity-0')
    expect(icon).toHaveClass('opacity-0', 'group-hover/handle:opacity-100')
  })

  it('exposes the accepted drop edge for interaction tests and assistive styling', () => {
    dndMocks.dropLine = 'bottom'
    renderBlock()

    expect(document.querySelector('[data-block-drop-line="bottom"]')).toBeInTheDocument()
  })
})
