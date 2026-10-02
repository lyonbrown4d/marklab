import { createRef, forwardRef, useImperativeHandle } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/milkdown/markdownEditorTypes'
import { markdownEditorTestSlashLabels } from '@/components/markdownEditorTestFixtures'
import VirtualizedMarkdownEditor from '@/components/VirtualizedMarkdownEditor'

vi.mock('@/components/MarkdownEditorSurface', () => ({
  default: forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
    useImperativeHandle(ref, () => ({
      focus: vi.fn(),
      getMarkdown: () => props.value,
    }))
    return (
      <textarea
        aria-label={`segment-${props.value.slice(0, 24)}`}
        data-testid="virtual-markdown-segment-editor"
        onChange={(event) => props.onChange(event.target.value)}
        value={props.value}
      />
    )
  }),
}))

vi.mock('@/components/VirtualizedMarkdownReadonlySurface', () => ({
  VirtualizedMarkdownReadonlySurface: ({ onActivate }: { onActivate: () => void }) => (
    <div data-testid="virtual-markdown-segment-readonly" onPointerDown={onActivate} />
  ),
}))

const section = (index: number) =>
  [
    `## Section ${index}`,
    '',
    ...Array.from({ length: 80 }, (_, line) => `Paragraph ${line}.`),
  ].join('\n\n')

const markdown = Array.from({ length: 16 }, (_, index) => section(index)).join('\n\n')

const props = {
  activePath: 'docs/large.md',
  onChange: vi.fn(),
  placeholder: 'Write',
  slashLabels: markdownEditorTestSlashLabels,
  value: markdown,
} satisfies MarkdownEditorProps

describe('VirtualizedMarkdownEditor', () => {
  it('mounts one active editor and lightweight readonly views for other visible segments', async () => {
    render(<VirtualizedMarkdownEditor {...props} />)

    const editors = await screen.findAllByTestId('virtual-markdown-segment-editor')
    const readonlyViews = await screen.findAllByTestId('virtual-markdown-segment-readonly')

    expect(editors).toHaveLength(1)
    expect(readonlyViews.length).toBeGreaterThan(0)
    expect(editors.length + readonlyViews.length).toBeLessThan(16)
  })

  it('promotes a readonly view to the only active editor when it is selected', async () => {
    render(<VirtualizedMarkdownEditor {...props} />)
    const initialEditor = (await screen.findAllByTestId('virtual-markdown-segment-editor'))[0]
    const readonlyView = (await screen.findAllByTestId('virtual-markdown-segment-readonly'))[0]

    fireEvent.pointerDown(readonlyView)

    const editors = await screen.findAllByTestId('virtual-markdown-segment-editor')
    expect(editors).toHaveLength(1)
    expect(editors[0]).not.toBe(initialEditor)
  })

  it('reconstructs the complete document after a segment edit', async () => {
    const onChange = vi.fn()
    const ref = createRef<MarkdownEditorHandle>()
    render(<VirtualizedMarkdownEditor {...props} onChange={onChange} ref={ref} />)
    const editor = (await screen.findAllByTestId('virtual-markdown-segment-editor'))[0]

    fireEvent.change(editor, { target: { value: '## Edited section' } })

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange.mock.calls[0][0]).toContain('## Edited section')
    expect(onChange.mock.calls[0][0]).toContain('## Section 15')
    expect(ref.current?.getMarkdown()).toBe(onChange.mock.calls[0][0])
  })

  it('keeps mounted editor segments stable while the native scrollbar thumb is dragged', async () => {
    const { container } = render(<VirtualizedMarkdownEditor {...props} />)
    const viewport = container.querySelector<HTMLElement>('.virtualized-markdown-editor')!
    const editorsBefore = await screen.findAllByTestId('virtual-markdown-segment-editor')
    viewport.getBoundingClientRect = () =>
      ({ bottom: 900, height: 900, left: 0, right: 800, top: 0, width: 800, x: 0, y: 0 }) as DOMRect

    fireEvent.pointerDown(viewport, { clientX: 795 })

    expect(screen.getAllByTestId('virtual-markdown-segment-editor')).toHaveLength(
      editorsBefore.length,
    )
    expect(container.querySelector('.virtualized-markdown-segment-placeholder')).toBeNull()
  })
})
