import { EditorView } from '@codemirror/view'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import MermaidCodeEditor from '@/components/previews/MermaidCodeEditor'

const intelligence = vi.hoisted(() => ({
  create: vi.fn(),
  dispose: vi.fn(),
  extensions: [] as never[],
}))

vi.mock('@/components/plate/code/mermaidCodeMirrorLanguage', () => ({
  createMermaidCodeMirrorIntelligence: intelligence.create,
}))
vi.mock('@/hooks/useDarkMode', () => ({ useDarkMode: () => true }))

describe('MermaidCodeEditor', () => {
  beforeAll(() => {
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => ({
        [Symbol.iterator]: function* () {},
        item: () => null,
        length: 0,
      }),
    })
  })

  it('mounts an isolated CodeMirror editor, focuses it, and relays document changes', async () => {
    intelligence.create.mockReturnValue({
      dispose: intelligence.dispose,
      extensions: intelligence.extensions,
    })
    const onBlur = vi.fn()
    const onChange = vi.fn()
    const onContextMenu = vi.fn()
    const result = render(
      <div onContextMenu={onContextMenu}>
        <MermaidCodeEditor
          onBlur={onBlur}
          onChange={onChange}
          uri="marklab-embedded://plate/diagram.mermaid"
          value="flowchart TD"
        />
      </div>,
    )

    const region = screen.getByRole('region', { name: 'Edit Mermaid source' })
    const editorElement = region.querySelector<HTMLElement>('.cm-editor')
    expect(editorElement).not.toBeNull()
    if (!editorElement) throw new Error('CodeMirror did not mount')
    expect(region).toHaveAttribute('contenteditable', 'false')
    const view = EditorView.findFromDOM(editorElement)
    if (!view) throw new Error('CodeMirror view not found')
    const destroy = vi.spyOn(view, 'destroy')
    expect(view.hasFocus).toBe(true)
    expect(intelligence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: expect.stringMatching(
          /^marklab-embedded:\/\/plate\/diagram\.mermaid#marklab-session-\d+$/,
        ),
        value: 'flowchart TD',
      }),
    )

    view.dispatch({ changes: { from: 10, insert: ' LR' } })
    expect(onChange).toHaveBeenCalledWith('flowchart  LRTD')
    fireEvent.contextMenu(view.contentDOM)
    expect(onContextMenu).not.toHaveBeenCalled()
    expect(onBlur).not.toHaveBeenCalled()

    view.contentDOM.blur()
    await waitFor(() => expect(onBlur).toHaveBeenCalledOnce())
    result.unmount()
    expect(intelligence.dispose).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
    expect(view.dom).not.toBeInTheDocument()
  })

  it('keeps the CodeMirror document in sync with an external value update', () => {
    intelligence.create.mockReturnValue({
      dispose: intelligence.dispose,
      extensions: intelligence.extensions,
    })
    const result = render(
      <MermaidCodeEditor
        onBlur={vi.fn()}
        onChange={vi.fn()}
        uri="marklab-embedded://plate/diagram.mermaid"
        value="flowchart TD"
      />,
    )
    const editorElement = result.container.querySelector<HTMLElement>('.cm-editor')
    if (!editorElement) throw new Error('CodeMirror did not mount')
    const view = EditorView.findFromDOM(editorElement)
    if (!view) throw new Error('CodeMirror view not found')

    result.rerender(
      <MermaidCodeEditor
        onBlur={vi.fn()}
        onChange={vi.fn()}
        uri="marklab-embedded://plate/diagram.mermaid"
        value="sequenceDiagram"
      />,
    )

    expect(view.state.doc.toString()).toBe('sequenceDiagram')
  })

  it('uses a fresh language document URI every time the editor is mounted', () => {
    intelligence.create.mockClear()
    intelligence.create.mockReturnValue({
      dispose: intelligence.dispose,
      extensions: intelligence.extensions,
    })
    const props = {
      onBlur: vi.fn(),
      onChange: vi.fn(),
      uri: 'marklab-embedded://plate/diagram.mermaid',
      value: 'flowchart TD',
    }

    const first = render(<MermaidCodeEditor {...props} />)
    first.unmount()
    const second = render(<MermaidCodeEditor {...props} />)
    second.unmount()

    const firstUri = intelligence.create.mock.calls[0]?.[0].uri
    const secondUri = intelligence.create.mock.calls[1]?.[0].uri
    expect(firstUri).not.toBe(secondUri)
  })
})
