import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownSourceEditorSurface } from '@/components/MarkdownSourceEditorSurface'

const editorMock = vi.hoisted(() => ({
  onContextMenuAction: vi.fn(),
  options: undefined as { contextmenu?: boolean; minimap?: { enabled?: boolean } } | undefined,
}))

vi.mock('@monaco-editor/react', () => ({
  default: ({ options }: { options?: typeof editorMock.options }) => {
    editorMock.options = options
    return <textarea aria-label="markdown source" />
  },
}))

const renderSurface = (sourceCodeMiniMapEnabled: boolean) =>
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
      sourceCodeMiniMapEnabled={sourceCodeMiniMapEnabled}
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
  })

  it('opens the source editor menu and delegates enabled actions', () => {
    renderSurface(false)

    fireEvent.contextMenu(screen.getByLabelText('markdown source'))

    expect(screen.getByRole('menuitem', { name: /Copy/ })).toHaveAttribute('data-disabled')
    fireEvent.click(screen.getByRole('menuitem', { name: /Inline code/ }))
    expect(editorMock.onContextMenuAction).toHaveBeenCalledWith('inlineCode')
  })
})
