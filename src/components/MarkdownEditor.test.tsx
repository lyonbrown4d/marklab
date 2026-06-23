import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownEditor from '@/components/MarkdownEditor'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'

const dropzoneState = vi.hoisted(() => ({
  isDragAccept: false,
}))

const hotkeysMock = vi.hoisted(() => ({
  useHotkeys: vi.fn(),
}))

const controllerMock = vi.hoisted(() => ({
  focusEditor: vi.fn(),
  getMarkdown: vi.fn(() => ''),
  importImageSources: vi.fn(async () => {}),
  placeSelectionAtClientPoint: vi.fn(),
  runShortcutAction: vi.fn(),
}))

const preferencesState = vi.hoisted(() => ({
  shortcutOverrides: {} as Record<string, string[]>,
}))

vi.mock('react-dropzone', () => ({
  useDropzone: vi.fn(() => ({
    isDragAccept: dropzoneState.isDragAccept,
    getRootProps: (props: Record<string, unknown>) => ({
      ...props,
      'data-testid': 'markdown-editor-shell',
      ref: vi.fn(),
    }),
  })),
}))

vi.mock('@tanstack/react-hotkeys', () => ({
  useHotkeys: hotkeysMock.useHotkeys,
}))

vi.mock('@prosemirror-adapter/react', () => ({
  ProsemirrorAdapterProvider: ({ children }: { children: ReactNode }) => children,
  useNodeViewFactory: () => vi.fn(),
}))

vi.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({
    children,
    viewportClassName,
    ...props
  }: {
    children: ReactNode
    viewportClassName?: string
  }) => (
    <div
      data-testid="markdown-editor-scroll-area"
      data-viewport-class={viewportClassName}
      {...props}
    >
      {children}
    </div>
  ),
}))

vi.mock('@/components/milkdown/useMarkdownCrepeController', () => ({
  useMarkdownCrepeController: vi.fn(() => ({
    focusEditor: controllerMock.focusEditor,
    getMarkdown: controllerMock.getMarkdown,
    handlers: {},
    importImageSources: controllerMock.importImageSources,
    placeSelectionAtClientPoint: controllerMock.placeSelectionAtClientPoint,
    rootRef: { current: null },
    runShortcutAction: controllerMock.runShortcutAction,
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
        'editor.dropImages': 'Drop to insert images',
        'editor.emptyHint': 'Type / for blocks, or paste images directly',
        'editor.importingImages': 'Importing images...',
        'editor.loadFailed': 'Editor failed to load',
        'editor.loading': 'Loading editor...',
      })[key] ?? key,
  }),
}))

vi.mock('@/runtime/webview', () => ({
  onRuntimeWebviewFileDrop: vi.fn(async () => vi.fn()),
}))

vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({
      shortcutOverrides: preferencesState.shortcutOverrides,
      markdownAssetImportStrategy: 'copy',
      immersiveZenMode: false,
      immersiveFocusMode: false,
      immersiveTypewriterMode: false,
      motionSmoothScrolling: false,
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

const renderEditor = (value: string) =>
  render(
    <MarkdownEditor
      activePath="notes/example.md"
      value={value}
      onChange={vi.fn()}
      placeholder="Write"
      slashLabels={slashLabels}
    />,
  )

type HotkeyDefinition = {
  handler?: () => void
  hotkey?: string
  [key: string]: unknown
  keys?: string
  key?: string
}

const registeredHotkeys = () => {
  return (hotkeysMock.useHotkeys.mock.calls[0]?.[0] ?? []) as HotkeyDefinition[]
}

const findRegisteredHotkey = (hotkey: string) => {
  return registeredHotkeys().find((definition) =>
    [definition.hotkey, definition.keys, definition.key].includes(hotkey),
  )
}

const triggerRegisteredHotkey = (definition: HotkeyDefinition | undefined) => {
  expect(definition).toBeDefined()
  const callback = Object.values(definition ?? {}).find(
    (value): value is (event?: { preventDefault: () => void }) => void =>
      typeof value === 'function',
  )
  expect(callback).toBeDefined()
  callback?.({ preventDefault: vi.fn() })
}

describe('MarkdownEditor shell', () => {
  beforeEach(() => {
    dropzoneState.isDragAccept = false
    preferencesState.shortcutOverrides = {}
    hotkeysMock.useHotkeys.mockClear()
    controllerMock.focusEditor.mockClear()
    controllerMock.getMarkdown.mockClear()
    controllerMock.importImageSources.mockClear()
    controllerMock.placeSelectionAtClientPoint.mockClear()
    controllerMock.runShortcutAction.mockClear()
  })

  it('marks empty documents and exposes localized editor hints', () => {
    renderEditor('   \n')

    const shell = screen.getByTestId('markdown-editor-shell')
    const editorRoot = shell.querySelector('.milkdown')

    expect(shell).toHaveClass('crepe')
    expect(shell).toHaveClass('is-empty-editor')
    expect(editorRoot).toHaveAttribute('data-drop-hint', 'Drop to insert images')
    expect(editorRoot).toHaveAttribute(
      'data-empty-hint',
      'Type / for blocks, or paste images directly',
    )
    expect(editorRoot).toHaveAttribute('data-import-hint', 'Importing images...')
  })

  it('does not mark non-empty documents as empty', () => {
    renderEditor('# Heading')

    expect(screen.getByTestId('markdown-editor-shell')).not.toHaveClass('is-empty-editor')
  })

  it('marks the shell while image drag is accepted', () => {
    dropzoneState.isDragAccept = true

    renderEditor('# Heading')

    const shell = screen.getByTestId('markdown-editor-shell')

    expect(shell).toHaveClass('is-image-drop-target')
    expect(shell).toHaveAttribute('data-drop-active', 'image')
  })

  it('registers editor shortcuts and forwards triggered actions to the controller', () => {
    renderEditor('# Heading')

    const boldShortcut = findRegisteredHotkey('Mod+B')
    const headingShortcut = findRegisteredHotkey('Mod+1')

    expect(boldShortcut).toBeDefined()
    expect(headingShortcut).toBeDefined()

    triggerRegisteredHotkey(boldShortcut)
    triggerRegisteredHotkey(headingShortcut)

    expect(controllerMock.runShortcutAction).toHaveBeenCalledWith('editor.bold')
    expect(controllerMock.runShortcutAction).toHaveBeenCalledWith('editor.heading1')
  })

  it('registers customized editor shortcut overrides', () => {
    preferencesState.shortcutOverrides = {
      'editor.bold': ['Mod+Shift+B'],
    }

    renderEditor('# Heading')

    const defaultBoldShortcut = findRegisteredHotkey('Mod+B')
    const customizedBoldShortcut = findRegisteredHotkey('Mod+Shift+B')

    expect(defaultBoldShortcut).toBeUndefined()
    expect(customizedBoldShortcut).toBeDefined()

    triggerRegisteredHotkey(customizedBoldShortcut)

    expect(controllerMock.runShortcutAction).toHaveBeenCalledWith('editor.bold')
  })
})
