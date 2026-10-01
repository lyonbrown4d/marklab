import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownSourceEditorSurface } from '@/components/MarkdownSourceEditorSurface'

const editorMock = vi.hoisted(() => ({
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
  default: ({ options }: { options?: typeof editorMock.options }) => {
    editorMock.options = options
    return <textarea aria-label="markdown source" />
  },
}))

const renderSurface = (
  sourceCodeMiniMapEnabled: boolean,
  readOnly = false,
  shortcutOverrides = {},
) =>
  render(
    <MarkdownSourceEditorSurface
      activePath="notes/current.md"
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

describe('MarkdownSourceEditorSurface', () => {
  it('passes the source editor minimap preference to Monaco', () => {
    renderSurface(true)
    expect(screen.getByLabelText('markdown source')).toBeInTheDocument()
    expect(editorMock.options?.minimap?.enabled).toBe(true)

    renderSurface(false)
    expect(editorMock.options?.minimap?.enabled).toBe(false)
    expect(editorMock.options?.contextmenu).toBe(false)
    expect(editorMock.options?.inlineSuggest?.enabled).toBe(true)
  })

  it('opens the source editor menu and delegates enabled actions', () => {
    renderSurface(false)

    fireEvent.contextMenu(screen.getByLabelText('markdown source'))

    expect(screen.getByRole('menuitem', { name: /Copy/ })).toHaveAttribute('data-disabled')
    fireEvent.click(screen.getByRole('menuitem', { name: /Inline code/ }))
    expect(editorMock.onContextMenuAction).toHaveBeenCalledWith('inlineCode')
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
    expect(container.querySelector('.markdown-source-editor')).toHaveClass('is-readonly-editor')
    expect(container.querySelector('.markdown-source-editor')).not.toHaveClass(
      'is-typewriter-editor',
    )
  })
})
