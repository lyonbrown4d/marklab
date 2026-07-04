import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownSourceEditorSurface } from '@/components/MarkdownSourceEditorSurface'

const editorMock = vi.hoisted(() => ({
  options: undefined as { minimap?: { enabled?: boolean } } | undefined,
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
  })
})
