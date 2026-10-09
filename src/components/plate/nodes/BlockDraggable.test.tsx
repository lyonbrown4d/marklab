import { fireEvent, render, screen } from '@testing-library/react'
import type { PlateElementProps } from 'platejs/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const dndMocks = vi.hoisted(() => ({
  dropLine: '' as '' | 'bottom' | 'top',
  handleRef: vi.fn(),
  nodeRef: { current: null },
}))

vi.mock('@platejs/dnd', () => ({
  useDraggable: () => ({
    handleRef: dndMocks.handleRef,
    isDragging: false,
    nodeRef: dndMocks.nodeRef,
  }),
  useDropLine: () => ({ dropLine: dndMocks.dropLine }),
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
  dndMocks.dropLine = ''
  dndMocks.handleRef.mockClear()
})

describe('BlockDraggable', () => {
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
