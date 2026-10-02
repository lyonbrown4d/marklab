import { createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, type Ref } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownEditor from '@/components/MarkdownEditor'
import type { MarkdownEditorHandle } from '@/components/milkdown/markdownEditorTypes'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'
import { useMarkdownPlaygroundController } from '@/components/milkdown/useMarkdownPlaygroundController'
import { useInlineAiComposer } from '@/components/milkdown/useInlineAiComposer'

const controllerMock = vi.hoisted(() => ({
  focusEditor: vi.fn(),
  getContextMenuCapabilities: vi.fn(() => ({
    copy: true,
    cut: true,
    link: true,
    redo: false,
    undo: true,
  })),
  getMarkdown: vi.fn(() => 'current markdown'),
  getEditorView: vi.fn(() => null),
  largeDocumentMode: false,
  aiDefaultProviderId: 'openai-main',
  runContextMenuAction: vi.fn(),
  shortcutOverrides: { 'editor.clearFormat': ['Control+Shift+X'] },
}))

vi.mock('@/components/milkdown/useMarkdownPlaygroundController', () => ({
  useMarkdownPlaygroundController: vi.fn(() => ({
    contextMenu: {
      getCapabilities: controllerMock.getContextMenuCapabilities,
      onAction: controllerMock.runContextMenuAction,
    },
    focusEditor: controllerMock.focusEditor,
    getEditorView: controllerMock.getEditorView,
    getMarkdown: controllerMock.getMarkdown,
    largeDocumentMode: controllerMock.largeDocumentMode,
    rootRef: { current: null },
    scrollAreaRef: { current: null },
    status: { phase: 'ready' },
  })),
}))

const inlineAiMock = vi.hoisted(() => ({
  accept: vi.fn(),
  anchor: { left: 8, top: 8 },
  dismiss: vi.fn(),
  error: null,
  instruction: '',
  isOpen: false,
  modelLabel: 'OpenAI · gpt-5-mini',
  phase: 'prompt' as const,
  proposal: '',
  quickAction: vi.fn(),
  retry: vi.fn(),
  setInstruction: vi.fn(),
  sourceText: 'Original',
  stop: vi.fn(),
  submit: vi.fn(),
}))

vi.mock('@/components/milkdown/useInlineAiComposer', () => ({
  useInlineAiComposer: vi.fn(() => inlineAiMock),
}))

vi.mock('@/hooks/useDarkMode', () => ({
  useDarkMode: () => false,
}))

vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: (select: (state: typeof controllerMock) => unknown) =>
    select(controllerMock),
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'editor.loadFailed': 'Editor failed to load',
        'editor.loading': 'Loading editor...',
        'edit.undo': 'Undo',
        'edit.redo': 'Redo',
        'edit.cut': 'Cut',
        'edit.copy': 'Copy',
        'edit.paste': 'Paste',
        'edit.selectAll': 'Select All',
        'shortcuts.bold': 'Bold',
        'shortcuts.italic': 'Italic',
        'shortcuts.inlineCode': 'Inline code',
        'shortcuts.strike': 'Strikethrough',
        'shortcuts.link': 'Insert link',
      })[key] ?? key,
  }),
}))

const slashLabels: SlashCommandLabels = {
  textGroup: 'Text',
  listGroup: 'List',
  advancedGroup: 'Advanced',
  text: 'Text',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  heading4: 'Heading 4',
  heading5: 'Heading 5',
  heading6: 'Heading 6',
  quote: 'Quote',
  divider: 'Divider',
  link: 'Link',
  linkUrlPrompt: 'Enter link URL',
  linkTextPrompt: 'Enter link text',
  bold: 'Bold',
  italic: 'Italic',
  inlineCode: 'Inline code',
  strike: 'Strikethrough',
  clearFormat: 'Clear format',
  bulletList: 'Bullet list',
  orderedList: 'Ordered list',
  taskList: 'Task list',
  image: 'Image',
  imageUrl: 'Image URL',
  imageUrlPrompt: 'Enter image URL',
  imageAltPrompt: 'Enter image description',
  codeBlock: 'Code block',
  codeTypeScript: 'TypeScript code',
  codeJavaScript: 'JavaScript code',
  codeJson: 'JSON code',
  codeBash: 'Bash code',
  codeHtml: 'HTML code',
  mermaid: 'Mermaid diagram',
  table: 'Table',
  footnote: 'Footnote',
  frontmatter: 'Frontmatter',
  details: 'Details',
  toc: 'Table of contents',
  calloutNote: 'Note callout',
  calloutTip: 'Tip callout',
  calloutImportant: 'Important callout',
  calloutWarning: 'Warning callout',
  calloutCaution: 'Caution callout',
  calendarFile: 'Calendar file',
  calendarFilePrompt: 'Calendar file name',
}

const renderEditor = (ref?: Ref<MarkdownEditorHandle>, readOnly = false) =>
  render(
    <MarkdownEditor
      activePath="notes/example.md"
      value="# Heading"
      onChange={vi.fn()}
      placeholder="Write"
      slashLabels={slashLabels}
      readOnly={readOnly}
      ref={ref}
    />,
  )

describe('MarkdownEditor playground baseline', () => {
  it('passes persisted shortcut overrides to the real controller entry point', () => {
    renderEditor()
    expect(
      vi.mocked(useMarkdownPlaygroundController).mock.calls.at(-1)?.[0].shortcutOverrides,
    ).toBe(controllerMock.shortcutOverrides)
  })

  it('marks the playground as a typewriter reading surface in read-only mode', () => {
    renderEditor(undefined, true)

    const root = document.querySelector('.crepe')
    expect(root).toHaveAttribute('data-readonly', 'true')
    expect(root).toHaveClass('is-readonly-editor')
    expect(root).toHaveClass('is-typewriter-editor')
    expect(root).toHaveAttribute('tabindex', '0')
    expect(vi.mocked(useMarkdownPlaygroundController).mock.calls.at(-1)?.[0].readOnly).toBe(true)
  })

  beforeEach(() => {
    inlineAiMock.isOpen = false
    controllerMock.largeDocumentMode = false
    controllerMock.focusEditor.mockClear()
    controllerMock.getMarkdown.mockClear()
    controllerMock.getContextMenuCapabilities.mockClear()
    controllerMock.runContextMenuAction.mockClear()
  })

  it('exposes large-document rendering mode on the editor surface', () => {
    controllerMock.largeDocumentMode = true
    renderEditor()

    expect(document.querySelector('.crepe')).toHaveAttribute('data-large-document', 'true')
  })

  it('mounts the transient AI companion against the editor bridge', () => {
    inlineAiMock.isOpen = true
    renderEditor()

    expect(useInlineAiComposer).toHaveBeenCalledWith(
      expect.objectContaining({
        activePath: 'notes/example.md',
        defaultProviderId: 'openai-main',
        getEditorView: controllerMock.getEditorView,
        readOnly: false,
        ready: true,
      }),
    )
    expect(screen.getByRole('dialog', { name: 'ai.composer.label' })).toBeInTheDocument()
  })

  it('renders the same empty crepe root shape as the official playground', () => {
    renderEditor()

    const root = document.querySelector('.crepe')

    expect(root).toHaveClass('flex')
    expect(root).toHaveClass('h-full')
    expect(root).toHaveClass('flex-1')
    expect(root).toHaveClass('flex-col')
    expect(root?.querySelector('.milkdown')).toBeNull()
  })

  it('does not render Marklab editor interaction hooks in the playground baseline', () => {
    renderEditor()

    const root = document.querySelector('.crepe')

    expect(root).not.toHaveAttribute('data-drop-active')
    expect(root).not.toHaveClass('is-image-drop-target')
    expect(root).not.toHaveClass('is-empty-editor')
    expect(root).not.toHaveAttribute('data-empty-hint')
  })

  it('still exposes the imperative editor handle to the rest of the app shell', () => {
    const ref = createRef<MarkdownEditorHandle>()

    renderEditor(ref)

    ref.current?.focus()

    expect(ref.current?.getMarkdown()).toBe('current markdown')
    expect(controllerMock.focusEditor).toHaveBeenCalledTimes(1)
  })

  it('replaces the browser menu with editor actions and runs formatting commands', async () => {
    renderEditor()
    const root = document.querySelector('.crepe') as HTMLElement
    const contextMenuEvent = createEvent.contextMenu(root)

    fireEvent(root, contextMenuEvent)

    expect(contextMenuEvent.defaultPrevented).toBe(true)
    expect(screen.getByRole('menuitem', { name: /Undo/ })).toBeEnabled()
    expect(screen.getByRole('menuitem', { name: /Redo/ })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: /Insert link/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: /Bold/ }))
    expect(controllerMock.runContextMenuAction).toHaveBeenCalledWith('bold')

    fireEvent.contextMenu(root)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('disables unavailable selection actions and hides links without link capability', () => {
    controllerMock.getContextMenuCapabilities.mockReturnValueOnce({
      copy: false,
      cut: false,
      link: false,
      redo: false,
      undo: false,
    })
    renderEditor()

    fireEvent.contextMenu(document.querySelector('.crepe') as HTMLElement)

    expect(screen.getByRole('menuitem', { name: /Copy/ })).toHaveAttribute('data-disabled')
    expect(screen.getByRole('menuitem', { name: /Cut/ })).toHaveAttribute('data-disabled')
    expect(screen.queryByRole('menuitem', { name: /Insert link/ })).not.toBeInTheDocument()
  })

  it('opens the editor menu from the keyboard', () => {
    renderEditor()

    fireEvent.keyDown(document.querySelector('.crepe') as HTMLElement, {
      key: 'F10',
      shiftKey: true,
    })

    expect(screen.getByRole('menuitem', { name: /Undo/ })).toBeInTheDocument()
  })
})
