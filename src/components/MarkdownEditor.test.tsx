import { render } from '@testing-library/react'
import { createRef, type Ref } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownEditor from '@/components/MarkdownEditor'
import type { MarkdownEditorHandle } from '@/components/milkdown/markdownEditorTypes'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'

const controllerMock = vi.hoisted(() => ({
  focusEditor: vi.fn(),
  getMarkdown: vi.fn(() => 'current markdown'),
}))

vi.mock('@/components/milkdown/useMarkdownPlaygroundController', () => ({
  useMarkdownPlaygroundController: vi.fn(() => ({
    focusEditor: controllerMock.focusEditor,
    getMarkdown: controllerMock.getMarkdown,
    rootRef: { current: null },
    scrollAreaRef: { current: null },
    status: { phase: 'ready' },
  })),
}))

vi.mock('@/hooks/useDarkMode', () => ({
  useDarkMode: () => false,
}))

vi.mock('@/i18n/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) =>
      ({
        'editor.loadFailed': 'Editor failed to load',
        'editor.loading': 'Loading editor...',
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

const renderEditor = (ref?: Ref<MarkdownEditorHandle>) =>
  render(
    <MarkdownEditor
      activePath="notes/example.md"
      value="# Heading"
      onChange={vi.fn()}
      placeholder="Write"
      slashLabels={slashLabels}
      ref={ref}
    />,
  )

describe('MarkdownEditor playground baseline', () => {
  beforeEach(() => {
    controllerMock.focusEditor.mockClear()
    controllerMock.getMarkdown.mockClear()
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
})
