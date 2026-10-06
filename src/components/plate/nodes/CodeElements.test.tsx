import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createPlateEditor, Plate, PlateContent } from 'platejs/react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlateNodePlugins } from '@/components/plate/nodes/plateNodePlugins'

const languageClient = vi.hoisted(() => ({
  openDocument: vi.fn().mockResolvedValue(undefined),
  changeDocument: vi.fn().mockResolvedValue(undefined),
  closeDocument: vi.fn().mockResolvedValue(undefined),
  completion: vi.fn().mockResolvedValue({
    isIncomplete: false,
    items: [
      {
        label: 'flowchart',
        textEdit: {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 2 },
          },
          newText: 'flowchart',
        },
      },
    ],
  }),
  diagnostics: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/components/editor/language/embeddedLanguageClient', () => ({
  embeddedLanguageClient: languageClient,
}))
vi.mock('@/components/previews/MermaidPreview', () => ({
  default: ({ onActivateEdit }: { onActivateEdit?: () => void }) => (
    <div data-testid="mermaid-preview" onClick={onActivateEdit}>
      <span>Mermaid preview</span>
      <button onClick={(event) => event.stopPropagation()} type="button">
        Expand mock
      </button>
    </div>
  ),
}))
vi.mock('@/components/previews/MermaidCodeEditor', () => ({
  default: ({
    onBlur,
    onChange,
    value,
  }: {
    onBlur: () => void
    onChange: (value: string) => void
    value: string
  }) => (
    <textarea
      aria-label="Mermaid source editor"
      onBlur={onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      value={value}
    />
  ),
}))

const renderCodeBlock = ({ language = 'mermaid', readOnly = false, source = 'fl' } = {}) => {
  const editor = createPlateEditor({
    plugins: createPlateNodePlugins(),
    value: [
      {
        type: 'code_block',
        lang: language,
        children: [{ type: 'code_line', children: [{ text: source }] }],
      },
    ],
  })
  editor.tf.select({ path: [0, 0, 0], offset: source.length })
  const result = render(
    <DndProvider backend={HTML5Backend}>
      <Plate editor={editor} readOnly={readOnly}>
        <PlateContent aria-label="Markdown document" readOnly={readOnly} />
      </Plate>
    </DndProvider>,
  )
  return { editor, ...result }
}

describe('CodeBlockElement language intelligence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens suggestions explicitly and accepts the active item with Enter', async () => {
    const { editor, container } = renderCodeBlock()
    const code = container.querySelector('pre')
    expect(code).not.toBeNull()
    await waitFor(() => expect(languageClient.openDocument).toHaveBeenCalled())
    editor.tf.select({ path: [0, 0, 0], offset: 2 })
    expect(editor.selection?.focus).toEqual({ path: [0, 0, 0], offset: 2 })

    fireEvent.keyDown(code!, { key: ' ', ctrlKey: true })
    await waitFor(() => expect(languageClient.completion).toHaveBeenCalled())
    const option = await screen.findByRole('option', { name: /flowchart/ })
    const listbox = screen.getByRole('listbox', { name: 'Code suggestions' })
    const editorRoot = screen.getByRole('textbox', { name: 'Markdown document' })
    expect(editorRoot).toHaveAttribute('aria-controls', listbox.id)
    expect(editorRoot).toHaveAttribute('aria-activedescendant', option.id)
    expect(editorRoot).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(code!, { key: 'Enter' })

    expect(editor.api.string([0, 0])).toBe('flowchart')
    expect(editorRoot).not.toHaveAttribute('aria-controls')
    expect(editorRoot).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(languageClient.changeDocument).toHaveBeenCalled())
  })

  it('does not accept suggestions while an IME composition is active', async () => {
    const { editor, container } = renderCodeBlock()
    const code = container.querySelector('pre')!
    await waitFor(() => expect(languageClient.openDocument).toHaveBeenCalled())
    editor.tf.select({ path: [0, 0, 0], offset: 2 })
    expect(editor.selection?.focus).toEqual({ path: [0, 0, 0], offset: 2 })

    fireEvent.keyDown(code, { key: ' ', ctrlKey: true })
    await waitFor(() => expect(languageClient.completion).toHaveBeenCalled())
    expect(await screen.findByRole('option', { name: /flowchart/ })).toBeInTheDocument()
    fireEvent.compositionStart(code)
    fireEvent.keyDown(code, { key: 'Enter', keyCode: 229 })

    expect(editor.api.string([0, 0])).toBe('fl')
  })

  it('shows only the rendered diagram for Mermaid blocks in the WYSIWYG editor', () => {
    const { container } = renderCodeBlock({ source: 'flowchart TD\nA --> B' })

    expect(screen.getByText('Mermaid preview')).toBeVisible()
    expect(container.querySelector('code[data-language="mermaid"]')).not.toBeVisible()
  })

  it('mounts a dedicated Mermaid editor on activation and writes changes back to Plate', async () => {
    const { container, editor } = renderCodeBlock({ source: 'flowchart TD\nA --> B' })
    const source = container.querySelector('code[data-language="mermaid"]')

    expect(source).not.toBeVisible()
    fireEvent.click(screen.getByTestId('mermaid-preview'))
    const mermaidEditor = await screen.findByRole('textbox', { name: 'Mermaid source editor' })
    expect(source).not.toBeVisible()

    fireEvent.change(mermaidEditor, { target: { value: 'flowchart LR\nA --> C' } })
    expect(editor.api.string([0])).toBe('flowchart LRA --> C')
    expect(editor.selection).not.toBeNull()
    expect(editor.api.node(editor.selection!.focus.path)).not.toBeNull()

    fireEvent.change(mermaidEditor, { target: { value: '' } })
    expect(editor.api.string([0])).toBe('')
    expect(screen.getByRole('textbox', { name: 'Mermaid source editor' })).toBeInTheDocument()

    fireEvent.blur(mermaidEditor)
    await waitFor(() =>
      expect(
        screen.queryByRole('textbox', { name: 'Mermaid source editor' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('does not activate Mermaid source from read-only previews or preview controls', () => {
    const editable = renderCodeBlock({ source: 'flowchart TD\nA --> B' })
    fireEvent.click(screen.getByRole('button', { name: 'Expand mock' }))
    expect(editable.container.querySelector('code[data-language="mermaid"]')).not.toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Mermaid source editor' })).not.toBeInTheDocument()
    editable.unmount()

    const readOnly = renderCodeBlock({ readOnly: true, source: 'flowchart TD\nA --> B' })
    fireEvent.click(screen.getByTestId('mermaid-preview'))
    expect(readOnly.container.querySelector('code[data-language="mermaid"]')).not.toBeVisible()
    expect(screen.queryByRole('textbox', { name: 'Mermaid source editor' })).not.toBeInTheDocument()
  })

  it('keeps ordinary code blocks visible in the WYSIWYG editor', () => {
    const { container } = renderCodeBlock({ language: 'typescript', source: 'const ready = true' })

    expect(container.querySelector('code[data-language="typescript"]')).toBeVisible()
    expect(screen.queryByText('Mermaid preview')).not.toBeInTheDocument()
  })
})
