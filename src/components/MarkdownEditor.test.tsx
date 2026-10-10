import { screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MarkdownEditorHandle } from '@/components/editor/markdownEditorTypes'
import {
  controllerMock,
  inlineAiComposerHookMock,
  inlineAiMock,
  renderAutoFocusEmbeddedEditor,
  renderEditor,
  renderEmbeddedEditor,
  resetMarkdownEditorMocks,
} from '@/components/MarkdownEditor.testFixtures'

const preferencesMock = Object.assign(controllerMock, {
  immersiveTypewriterMode: false,
})

const keepAliveState = vi.hoisted(() => ({
  active: true,
  cacheKey: undefined as string | undefined,
}))

vi.mock('keepalive-for-react', () => ({
  useKeepAliveContext: () => keepAliveState,
}))

vi.mock('@/components/plate/PlateEditorOverlays', () => ({
  PlateEditorOverlays: ({ activePath }: { activePath: string | null }) => (
    <div aria-label={`Formatting ${activePath}`} role="toolbar" />
  ),
}))

describe('MarkdownEditor playground baseline', () => {
  beforeEach(() => {
    resetMarkdownEditorMocks()
    preferencesMock.immersiveTypewriterMode = false
    keepAliveState.active = true
    keepAliveState.cacheKey = undefined
  })

  it('exposes the stable editor surface through the Plate engine', () => {
    renderEditor()

    expect(screen.getByTestId('markdown-editor')).toHaveAttribute('data-editor-engine', 'plate')
  })

  it('prevents editing without enabling typewriter presentation in read-only mode', () => {
    renderEditor(undefined, true)

    const root = screen.getByTestId('markdown-editor')
    expect(root).toHaveAttribute('data-readonly', 'true')
    expect(root).toHaveClass('is-readonly-editor')
    expect(root).not.toHaveClass('is-typewriter-editor')
    expect(root).toHaveAttribute('tabindex', '0')
    expect(root).toHaveAttribute('contenteditable', 'false')
  })

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])('keeps readOnly=%s independent from typewriter=%s', (readOnly, typewriter) => {
    preferencesMock.immersiveTypewriterMode = typewriter
    renderEditor(undefined, readOnly)

    const root = screen.getByTestId('markdown-editor')
    expect(root.classList.contains('is-readonly-editor')).toBe(readOnly)
    expect(root.classList.contains('is-typewriter-editor')).toBe(typewriter)
    expect(root).toHaveAttribute('contenteditable', String(!readOnly))
  })

  it('mounts the transient AI companion against the editor bridge', () => {
    inlineAiMock.isOpen = true
    renderEditor()

    expect(inlineAiComposerHookMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activePath: 'notes/example.md',
        defaultProviderId: 'openai-main',
        getEditor: expect.any(Function),
        readOnly: false,
        ready: true,
      }),
    )
    expect(screen.getByRole('dialog', { name: 'ai.composer.label' })).toBeInTheDocument()
    expect(screen.getByRole('toolbar', { name: 'Formatting notes/example.md' })).toBeInTheDocument()
  })

  it('suspends overlays and the AI composer when its KeepAlive route becomes inactive', () => {
    inlineAiMock.isOpen = true
    keepAliveState.active = false
    keepAliveState.cacheKey = 'workspace-map'
    renderEditor()

    expect(inlineAiComposerHookMock).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'ai.composer.label' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('toolbar', { name: 'Formatting notes/example.md' }),
    ).not.toBeInTheDocument()
  })

  it('honors an explicitly inactive editor outside a KeepAlive route', () => {
    inlineAiMock.isOpen = true
    renderEditor(undefined, false, '# Heading', false)

    expect(screen.queryByRole('dialog', { name: 'ai.composer.label' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('toolbar', { name: 'Formatting notes/example.md' }),
    ).not.toBeInTheDocument()
  })

  it('renders a single stable Plate editing surface', () => {
    renderEditor()

    const root = screen.getByTestId('markdown-editor')

    expect(root).toHaveClass('markdown-editor')
    expect(root).toHaveAttribute('data-editor-engine', 'plate')
    expect(document.querySelector('[data-editor-engine="plate"]')).toBeInTheDocument()
  })

  it('scopes embedded presentation without creating a second editor path', () => {
    renderEmbeddedEditor()

    expect(screen.getAllByTestId('markdown-editor')).toHaveLength(1)
    expect(screen.getByTestId('markdown-editor')).toHaveClass('markdown-editor--embedded')
  })

  it('keeps large documents on one chunked Plate editor path', () => {
    const value = '# Large document\n\n' + 'paragraph\n\n'.repeat(401)

    renderEditor(undefined, false, value)

    expect(screen.getAllByTestId('markdown-editor')).toHaveLength(1)
    expect(document.querySelectorAll('[data-slate-chunk="true"]').length).toBeGreaterThan(1)
  })

  it('does not render Marklab editor interaction hooks in the playground baseline', () => {
    renderEditor()

    const root = screen.getByTestId('markdown-editor')

    expect(root).not.toHaveAttribute('data-drop-active')
    expect(root).not.toHaveClass('is-image-drop-target')
    expect(root).not.toHaveClass('is-empty-editor')
    expect(root).not.toHaveAttribute('data-empty-hint')
  })

  it('still exposes the imperative editor handle to the rest of the app shell', async () => {
    const ref = createRef<MarkdownEditorHandle>()

    renderEditor(ref)

    ref.current?.focus()

    expect((await ref.current?.getMarkdown())?.trim()).toBe('# Heading')
    expect(document.activeElement).toBe(screen.getByTestId('markdown-editor'))
  })

  it('focuses once after an embedded editor reports ready', async () => {
    const view = renderAutoFocusEmbeddedEditor()

    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('markdown-editor')))
    view.rerenderValue('# Updated')

    expect(document.activeElement).toBe(screen.getByTestId('markdown-editor'))
  })
})
