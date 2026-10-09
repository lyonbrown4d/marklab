import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  PlateEditorSurface,
  type PlateEditorSurfaceHandle,
} from '@/components/plate/PlateEditorSurface'

describe('PlateEditorSurface rendering', () => {
  it('renders Markdown with stable block ids through the Plate editor surface', () => {
    const ref = createRef<PlateEditorSurfaceHandle>()
    render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        ref={ref}
        value={'# Heading\n\nParagraph'}
      />,
    )

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-editor-engine', 'plate')
    expect(ref.current?.getEditor().children).toMatchObject([
      { children: [{ text: 'Heading' }], id: expect.any(String), type: 'h1' },
      { children: [{ text: 'Paragraph' }], id: expect.any(String), type: 'p' },
    ])
  })

  it('provides stable drag handles for editable top-level blocks', () => {
    const { container } = render(
      <PlateEditorSurface
        activePath="notes/example.md"
        onChange={vi.fn()}
        placeholder="Write"
        value={'First\n\nSecond'}
      />,
    )

    expect(
      container.querySelectorAll<HTMLElement>('[data-block-drag-wrapper="true"]'),
    ).toHaveLength(2)
    const handles = screen.getAllByRole('button', { name: 'Move block' })
    expect(handles).toHaveLength(2)
    expect(handles[0]).toHaveAttribute('draggable', 'true')
  })
})
