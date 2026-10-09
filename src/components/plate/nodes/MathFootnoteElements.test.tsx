import { act, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FootnoteReferencePlugin } from '@platejs/footnote/react'
import { createPlateEditor, Plate, PlateContent } from 'platejs/react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { createPlateEditorPlugins } from '@/components/plate/plateEditorConfig'
import { deserializePlateMarkdown } from '@/components/plate/plateMarkdownSerialization'

const renderEditor = (editor: ReturnType<typeof createPlateEditor>, readOnly = true) => {
  return {
    editor,
    ...render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <DndProvider backend={HTML5Backend}>
            <Plate editor={editor} readOnly={readOnly}>
              <PlateContent aria-label="Markdown document" readOnly={readOnly} />
            </Plate>
          </DndProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

const renderMarkdown = (markdown: string, readOnly = true) =>
  renderEditor(
    createPlateEditor({
      plugins: createPlateEditorPlugins(),
      value: (instance) => deserializePlateMarkdown(instance, markdown),
    }),
    readOnly,
  )

describe('Plate math and footnote elements', () => {
  it('renders inline and display formulas as accessible KaTeX math', () => {
    renderMarkdown(['Inline $x^2$.', '', '$$', '\\sum_{i=1}^n i', '$$'].join('\n'))

    expect(screen.getAllByRole('math')).toHaveLength(2)
    expect(screen.getByRole('math', { name: 'x^2' }).closest('.katex')).not.toBeNull()
    expect(
      screen.getByRole('math', { name: '\\sum_{i=1}^n i' }).closest('.katex-display'),
    ).not.toBeNull()
  })

  it('keeps untrusted KaTeX commands from creating executable links', () => {
    const { container } = renderMarkdown('Unsafe $\\href{javascript:alert(1)}{click}$.')

    expect(container.querySelector('a')).toBeNull()
    expect(container).toHaveTextContent('\\href')
  })

  it('ignores a polluted Object.prototype trust flag when rendering KaTeX links', () => {
    const previousTrust = Object.getOwnPropertyDescriptor(Object.prototype, 'trust')
    Object.defineProperty(Object.prototype, 'trust', {
      configurable: true,
      value: true,
      writable: true,
    })

    try {
      const { container } = renderMarkdown('Unsafe $\\href{javascript:alert(1)}{click}$.')

      expect(container.querySelector('a')).toBeNull()
      expect(container).toHaveTextContent('\\href')
    } finally {
      if (previousTrust) Object.defineProperty(Object.prototype, 'trust', previousTrust)
      else Reflect.deleteProperty(Object.prototype, 'trust')
    }
  })

  it('renders a linked footnote reference and its definition in read-only mode', () => {
    renderMarkdown(['Read this[^note].', '', '[^note]: Supporting detail.'].join('\n'))

    const definition = screen.getByRole('doc-footnote', { name: '[^note]' })
    expect(screen.getByRole('link', { name: '[^note]' })).toHaveAttribute(
      'href',
      `#${definition.id}`,
    )
    expect(definition).toHaveTextContent('Supporting detail.')
  })

  it('scopes footnote targets to each editor instance', () => {
    const markdown = ['Read this[^note].', '', '[^note]: Supporting detail.'].join('\n')
    renderMarkdown(markdown)
    renderMarkdown(markdown)

    const definitions = screen.getAllByRole('doc-footnote', { name: '[^note]' })
    const links = screen.getAllByRole('link', { name: '[^note]' })
    expect(new Set(definitions.map(({ id }) => id))).toHaveProperty('size', 2)
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      definitions.map(({ id }) => `#${id}`),
    )
  })

  it('focuses a resolved footnote definition when its editable reference is clicked', () => {
    const { editor } = renderMarkdown(
      ['Read this[^note].', '', '[^note]: Supporting detail.'].join('\n'),
      false,
    )

    fireEvent.click(screen.getByRole('link', { name: '[^note]' }))

    const definition = editor
      .getApi(FootnoteReferencePlugin)
      .footnote.definition({ identifier: 'note' })
    expect(definition).toBeDefined()
    expect(editor.selection).not.toBeNull()
    expect(editor.selection?.anchor.path.slice(0, definition![1].length)).toEqual(definition![1])
  })

  it('leaves selection unchanged when an editable footnote reference is unresolved', () => {
    const editor = createPlateEditor({
      plugins: createPlateEditorPlugins(),
      value: [
        {
          type: 'p',
          children: [
            { text: 'Read this' },
            {
              type: 'footnoteReference',
              identifier: 'missing',
              children: [{ text: '' }],
            },
            { text: '.' },
          ],
        },
      ],
    })
    editor.selection = {
      anchor: { path: [0, 0], offset: 4 },
      focus: { path: [0, 0], offset: 4 },
    }
    const initialSelection = structuredClone(editor.selection)
    renderEditor(editor, false)
    const link = screen.getByRole('link', { name: '[^missing]' })
    fireEvent.click(link)

    expect(link).toHaveAttribute('href', `#footnote-${encodeURIComponent(editor.id)}-missing`)
    expect(screen.queryByRole('doc-footnote')).not.toBeInTheDocument()
    expect(JSON.stringify(editor.children)).not.toContain('"type":"footnoteDefinition"')
    expect(editor.selection).toEqual(initialSelection)
  })

  it('edits equation source from the editable formula popover only', () => {
    const { editor } = renderMarkdown('Inline $x^2$.', false)

    fireEvent.click(screen.getByRole('button', { name: 'LaTeX: x^2' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'LaTeX' }), {
      target: { value: 'y = 2' },
    })

    expect(JSON.stringify(editor.children)).toContain('"texExpression":"y = 2"')
  })

  it('does not submit the equation while an IME composition is confirming', () => {
    renderMarkdown('Inline $x^2$.', false)
    fireEvent.click(screen.getByRole('button', { name: 'LaTeX: x^2' }))
    const input = screen.getByRole('textbox', { name: 'LaTeX' })

    fireEvent.keyDown(input, {
      code: 'Enter',
      isComposing: true,
      key: 'Enter',
      keyCode: 13,
      which: 13,
    })
    expect(input).toBeInTheDocument()

    fireEvent.keyDown(input, { code: 'Enter', key: 'Enter', keyCode: 13, which: 13 })
    expect(input).not.toBeInTheDocument()
  })

  it('restores an inline equation when editing is dismissed with Escape', () => {
    const { editor } = renderMarkdown('Inline $x^2$.', false)
    fireEvent.click(screen.getByRole('button', { name: 'LaTeX: x^2' }))
    const input = screen.getByRole('textbox', { name: 'LaTeX' })
    fireEvent.change(input, { target: { value: 'y = 2' } })

    fireEvent.keyDown(input, { code: 'Escape', key: 'Escape', keyCode: 27, which: 27 })

    expect(input).not.toBeInTheDocument()
    expect(JSON.stringify(editor.children)).toContain('"texExpression":"x^2"')
  })

  it.each([
    ['Escape', (input: HTMLElement) => fireEvent.keyDown(input, { key: 'Escape' })],
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))],
  ] as const)('restores a block equation when editing is dismissed with %s', (_name, dismiss) => {
    const { editor } = renderMarkdown(['$$', 'x^2', '$$'].join('\n'), false)
    fireEvent.click(screen.getByRole('button', { name: 'LaTeX: x^2' }))
    const input = screen.getByRole('textbox', { name: 'LaTeX' })
    fireEvent.change(input, { target: { value: 'y = 2' } })

    dismiss(input)

    expect(input).not.toBeInTheDocument()
    expect(JSON.stringify(editor.children)).toContain('"texExpression":"x^2"')
    act(() => editor.undo())
    expect(JSON.stringify(editor.children)).toContain('"texExpression":"x^2"')
  })

  it('keeps inline equation typing in one undo step after an earlier body edit', () => {
    const { editor } = renderMarkdown('Inline $x^2$.', false)
    act(() => {
      editor.tf.select({ path: [0, 0], offset: 0 })
      editor.tf.insertText('Before ')
    })
    const afterBodyEdit = structuredClone(editor.children)
    fireEvent.click(screen.getByRole('button', { name: 'LaTeX: x^2' }))
    const input = screen.getByRole('textbox', { name: 'LaTeX' })
    fireEvent.change(input, { target: { value: 'y' } })
    fireEvent.change(input, { target: { value: 'y = 2' } })

    act(() => editor.undo())

    expect(editor.children).toEqual(afterBodyEdit)
  })

  it('does not expose equation editing controls in read-only mode', () => {
    renderMarkdown('Inline $x^2$.')

    expect(screen.queryByRole('button', { name: 'LaTeX: x^2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'LaTeX' })).not.toBeInTheDocument()
  })
})
