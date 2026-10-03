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
  default: () => <div>Mermaid preview</div>,
}))

const renderCodeBlock = () => {
  const editor = createPlateEditor({
    plugins: createPlateNodePlugins(),
    value: [
      {
        type: 'code_block',
        lang: 'mermaid',
        children: [{ type: 'code_line', children: [{ text: 'fl' }] }],
      },
    ],
  })
  editor.tf.select({ path: [0, 0, 0], offset: 2 })
  const result = render(
    <DndProvider backend={HTML5Backend}>
      <Plate editor={editor}>
        <PlateContent aria-label="Markdown document" />
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
})
