import { fireEvent, render, screen } from '@testing-library/react'
import type { PlateElementProps } from 'platejs/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dndMocks = vi.hoisted(() => ({
  handleRef: vi.fn(),
  nodeRef: { current: null },
}))

vi.mock('@platejs/dnd', () => ({
  DRAG_ITEM_BLOCK: 'block',
  useDragNode: () => [{ isDragging: false }, dndMocks.handleRef, vi.fn()],
  useDropLine: () => ({ dropLine: '' }),
  useDropNode: () => [{ isOver: false }, vi.fn()],
}))

vi.mock('platejs/react', () => ({
  useEditorRef: () => ({
    api: { findPath: vi.fn() },
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

beforeEach(() => {
  dndMocks.handleRef.mockClear()
})

describe('BlockDraggable', () => {
  it('mounts the drag handle only while its block is interactive', () => {
    const { container } = renderBlock()
    const wrapper = container.querySelector<HTMLElement>('[data-block-drag-wrapper="true"]')

    expect(screen.queryByRole('button', { name: 'Move block' })).not.toBeInTheDocument()
    fireEvent.pointerEnter(wrapper!)
    expect(screen.getByRole('button', { name: 'Move block' })).toBeVisible()
    fireEvent.pointerLeave(wrapper!)
    expect(screen.queryByRole('button', { name: 'Move block' })).not.toBeInTheDocument()
  })

  it('keeps the drag handle mounted while keyboard focus remains in the block', () => {
    const { container } = renderBlock()
    const wrapper = container.querySelector<HTMLElement>('[data-block-drag-wrapper="true"]')

    fireEvent.pointerEnter(wrapper!)
    const handle = screen.getByRole('button', { name: 'Move block' })
    handle.focus()
    expect(handle).toHaveFocus()
    fireEvent.pointerLeave(wrapper!)

    expect(handle).toBeVisible()
  })
})
