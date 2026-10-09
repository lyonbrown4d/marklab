import { fireEvent, render, screen } from '@testing-library/react'
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
}))

vi.mock('@platejs/dnd', () => ({
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

vi.mock('platejs/react', () => ({
  useEditorRef: () => ({
    api: { findPath: editorMocks.findPath },
    children: [],
    tf: { moveNodes: vi.fn() },
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
})

describe('BlockDraggable', () => {
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
