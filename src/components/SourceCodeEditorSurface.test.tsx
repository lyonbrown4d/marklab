import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SourceCodeEditorSurface } from '@/components/SourceCodeEditorSurface'

const editorMock = vi.hoisted(() => ({
  language: undefined as string | undefined,
  path: undefined as string | undefined,
  onContextMenuAction: vi.fn(),
  options: undefined as
    | {
        contextmenu?: boolean
        domReadOnly?: boolean
        inlineSuggest?: { enabled?: boolean }
        minimap?: { enabled?: boolean }
        readOnly?: boolean
      }
    | undefined,
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({
    language,
    onChange,
    options,
    path,
  }: {
    language?: string
    onChange?: (value: string) => void
    options?: typeof editorMock.options
    path?: string
  }) => {
    editorMock.language = language
    editorMock.options = options
    editorMock.path = path
    return (
      <textarea
        aria-label="markdown source"
        onChange={(event) => onChange?.(event.currentTarget.value)}
      />
    )
  },
}))

const renderSurface = (
  sourceCodeMiniMapEnabled: boolean,
  readOnly = false,
  shortcutOverrides = {},
  activePath = 'notes/current.md',
) =>
  render(
    <SourceCodeEditorSurface
      activePath={activePath}
      workspaceKey="external:C:/notes"
      darkMode={false}
      errorMessage={null}
      immersiveFocusMode={false}
      immersiveTypewriterMode={false}
      immersiveZenMode={false}
      loadingLabel="Loading source editor..."
      monacoReady
      motionAnimatedCursor={false}
      motionSmoothScrolling={false}
      readOnly={readOnly}
      sourceCodeMiniMapEnabled={sourceCodeMiniMapEnabled}
      shortcutOverrides={shortcutOverrides}
      value="# Current"
      onChange={vi.fn()}
      contextMenu={{
        getCapabilities: () => ({ copy: false, cut: false, link: true }),
        onAction: editorMock.onContextMenuAction,
      }}
      onMount={vi.fn()}
    />,
  )

describe('SourceCodeEditorSurface', () => {
  it('selects the Monaco language from the active source path', () => {
    const view = renderSurface(false, false, {}, 'src/example.ts')
    expect(editorMock.language).toBe('typescript')

    view.rerender(
      <SourceCodeEditorSurface
        activePath="notes/current.md"
        workspaceKey="external:C:/notes"
        darkMode={false}
        errorMessage={null}
        immersiveFocusMode={false}
        immersiveTypewriterMode={false}
        immersiveZenMode={false}
        loadingLabel="Loading source editor..."
        monacoReady
        motionAnimatedCursor={false}
        motionSmoothScrolling={false}
        sourceCodeMiniMapEnabled={false}
        value="# Current"
        onChange={vi.fn()}
        onMount={vi.fn()}
      />,
    )
    expect(editorMock.language).toBe('markdown')

    view.rerender(
      <SourceCodeEditorSurface
        activePath="src/native.c"
        workspaceKey="external:C:/notes"
        darkMode={false}
        errorMessage={null}
        immersiveFocusMode={false}
        immersiveTypewriterMode={false}
        immersiveZenMode={false}
        loadingLabel="Loading source editor..."
        monacoReady
        motionAnimatedCursor={false}
        motionSmoothScrolling={false}
        sourceCodeMiniMapEnabled={false}
        value="int main(void) {}"
        onChange={vi.fn()}
        onMount={vi.fn()}
      />,
    )
    expect(editorMock.language).toBe('plaintext')
  })

  it('passes the source editor minimap preference to Monaco', () => {
    renderSurface(true)
    expect(screen.getByLabelText('markdown source')).toBeInTheDocument()
    expect(editorMock.options?.minimap?.enabled).toBe(true)

    renderSurface(false)
    expect(editorMock.options?.minimap?.enabled).toBe(false)
    expect(editorMock.options?.contextmenu).toBe(false)
    expect(editorMock.options?.inlineSuggest?.enabled).toBe(true)
  })

  it('scopes Monaco model paths to the workspace identity', () => {
    const view = renderSurface(false, false, {}, 'README.md')
    const firstPath = editorMock.path

    view.rerender(
      <SourceCodeEditorSurface
        activePath="README.md"
        workspaceKey="external:D:/other-notes"
        darkMode={false}
        errorMessage={null}
        immersiveFocusMode={false}
        immersiveTypewriterMode={false}
        immersiveZenMode={false}
        loadingLabel="Loading source editor..."
        monacoReady
        motionAnimatedCursor={false}
        motionSmoothScrolling={false}
        sourceCodeMiniMapEnabled={false}
        value="# Current"
        onChange={vi.fn()}
        onMount={vi.fn()}
      />,
    )

    expect(firstPath).toContain('external%3AC%3A%2Fnotes')
    expect(editorMock.path).toContain('external%3AD%3A%2Fother-notes')
    expect(editorMock.path).not.toBe(firstPath)
  })

  it('opens the source editor menu and delegates enabled actions', () => {
    renderSurface(false)

    fireEvent.contextMenu(screen.getByLabelText('markdown source'))

    expect(screen.getByRole('menuitem', { name: /Copy/ })).toHaveAttribute('data-disabled')
    fireEvent.click(screen.getByRole('menuitem', { name: /Inline code/ }))
    expect(editorMock.onContextMenuAction).toHaveBeenCalledWith('inlineCode')
  })

  it('keeps generic context actions but hides Markdown formatting for source files', () => {
    renderSurface(false, false, {}, 'src/example.ts')

    fireEvent.contextMenu(screen.getByLabelText('markdown source'))

    expect(screen.getByRole('menuitem', { name: /Copy/ })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: /Inline code/ })).not.toBeInTheDocument()
  })

  it('shows the configured source editor shortcuts in the shared context menu', () => {
    renderSurface(false, false, { 'editor.inlineCode': ['F8'] })

    fireEvent.contextMenu(screen.getByLabelText('markdown source'))

    expect(screen.getByRole('menuitem', { name: /Inline code/ })).toHaveTextContent('F8')
  })

  it('uses Monaco read-only semantics without applying the rendered typewriter treatment', () => {
    const { container } = renderSurface(false, true)

    expect(editorMock.options?.readOnly).toBe(true)
    expect(editorMock.options?.domReadOnly).toBe(true)
    expect(container.querySelector('.source-code-editor')).toHaveClass('is-readonly-editor')
    expect(container.querySelector('.source-code-editor')).not.toHaveClass('is-typewriter-editor')
  })

  it('ignores Monaco change notifications while its cached route is inactive', () => {
    const onChange = vi.fn()
    render(
      <SourceCodeEditorSurface
        activePath="notes/current.md"
        workspaceKey="external:C:/notes"
        darkMode={false}
        errorMessage={null}
        immersiveFocusMode={false}
        immersiveTypewriterMode={false}
        immersiveZenMode={false}
        interactionActive={false}
        loadingLabel="Loading source editor..."
        monacoReady
        motionAnimatedCursor={false}
        motionSmoothScrolling={false}
        sourceCodeMiniMapEnabled={false}
        value="# Current"
        onChange={onChange}
        onMount={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('markdown source'), { target: { value: '# Stale' } })

    expect(onChange).not.toHaveBeenCalled()
  })
})
