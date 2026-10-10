import { render } from '@testing-library/react'
import type { Ref } from 'react'
import { vi } from 'vitest'
import MarkdownEditor from '@/components/MarkdownEditor'
import type {
  MarkdownEditorHandle,
  MarkdownEditorSlashLabels,
} from '@/components/editor/markdownEditorTypes'
import { usePlateInlineAiComposer } from '@/components/plate/usePlateInlineAiComposer'

const controllerMock = vi.hoisted(() => ({
  getContextMenuCapabilities: vi.fn(() => ({
    copy: true,
    cut: true,
    link: true,
    redo: false,
    undo: true,
  })),
  aiDefaultProviderId: 'openai-main',
  immersiveFocusIntensity: 'standard',
  immersiveFocusMode: false,
  immersiveFocusScope: 'block',
  runContextMenuAction: vi.fn(),
  shortcutOverrides: { 'editor.clearFormat': ['Control+Shift+X'] },
}))

vi.mock('@/components/plate/usePlateEditorContextMenu', () => ({
  usePlateEditorContextMenu: () => ({
    getCapabilities: controllerMock.getContextMenuCapabilities,
    onAction: controllerMock.runContextMenuAction,
  }),
}))

const inlineAiMock = vi.hoisted(() => ({
  accept: vi.fn(),
  anchor: { left: 8, top: 8 },
  dismiss: vi.fn(),
  error: null,
  instruction: '',
  isOpen: false,
  modelLabel: 'OpenAI · gpt-5-mini',
  providerId: 'openai-main',
  providers: [{ id: 'openai-main', label: 'OpenAI · gpt-5-mini', locality: 'remote' as const }],
  phase: 'prompt' as const,
  proposal: '',
  quickAction: vi.fn(),
  retry: vi.fn(),
  setInstruction: vi.fn(),
  setProviderId: vi.fn(),
  sourceText: 'Original',
  stop: vi.fn(),
  submit: vi.fn(),
}))

vi.mock('@/components/plate/usePlateInlineAiComposer', () => ({
  usePlateInlineAiComposer: vi.fn(() => inlineAiMock),
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
        'edit.copyAsMarkdown': 'Copy as Markdown',
        'edit.paste': 'Paste',
        'edit.pasteAsPlainText': 'Paste as Plain Text',
        'edit.selectAll': 'Select All',
        'shortcuts.bold': 'Bold',
        'shortcuts.italic': 'Italic',
        'shortcuts.inlineCode': 'Inline code',
        'shortcuts.strike': 'Strikethrough',
        'shortcuts.link': 'Insert link',
      })[key] ?? key,
  }),
}))

const slashLabels: MarkdownEditorSlashLabels = {
  textGroup: 'Text',
  listGroup: 'List',
  advancedGroup: 'Advanced',
  menuLabel: 'Block suggestions',
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
  blockMath: 'Block equation',
  italic: 'Italic',
  inlineCode: 'Inline code',
  inlineMath: 'Inline equation',
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
  cancel: 'Cancel',
  insertionError: 'Insertion failed',
  noResults: 'No matching blocks',
}

export const inlineAiComposerHookMock = vi.mocked(usePlateInlineAiComposer)

export { controllerMock, inlineAiMock }

export const resetMarkdownEditorMocks = () => {
  inlineAiMock.isOpen = false
  controllerMock.getContextMenuCapabilities.mockClear()
  controllerMock.runContextMenuAction.mockClear()
}

export const renderEditor = (
  ref?: Ref<MarkdownEditorHandle>,
  readOnly = false,
  value = '# Heading',
  interactionActive = true,
) =>
  render(
    <MarkdownEditor
      activePath="notes/example.md"
      value={value}
      onChange={vi.fn()}
      placeholder="Write"
      slashLabels={slashLabels}
      readOnly={readOnly}
      ref={ref}
      interactionActive={interactionActive}
    />,
  )

export const renderEmbeddedEditor = () =>
  render(
    <MarkdownEditor
      activePath="notes/example.md"
      value="# Heading"
      onChange={vi.fn()}
      placeholder="Write"
      slashLabels={slashLabels}
      variant="embedded"
    />,
  )

export const renderAutoFocusEmbeddedEditor = () => {
  const renderValue = (value: string) => (
    <MarkdownEditor
      activePath="notes/example.md"
      autoFocus
      onChange={vi.fn()}
      placeholder="Write"
      slashLabels={slashLabels}
      value={value}
      variant="embedded"
    />
  )
  const view = render(renderValue('# Heading'))

  return {
    ...view,
    rerenderValue: (value: string) => view.rerender(renderValue(value)),
  }
}
