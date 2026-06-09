import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarkdownEditor from '@/components/MarkdownEditor'
import type { SlashCommandLabels } from '@/components/milkdown/slashMenuConfig'

const dropzoneState = vi.hoisted(() => ({
  isDragAccept: false,
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
  useHotkeys: vi.fn(),
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
    focusEditor: vi.fn(),
    getMarkdown: vi.fn(() => ''),
    handlers: {},
    importImageSources: vi.fn(async () => {}),
    placeSelectionAtClientPoint: vi.fn(),
    rootRef: { current: null },
    runShortcutAction: vi.fn(),
    scrollAreaRef: { current: null },
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
      })[key] ?? key,
  }),
}))

vi.mock('@/runtime/webview', () => ({
  onRuntimeWebviewFileDrop: vi.fn(async () => vi.fn()),
}))

vi.mock('@/store/usePreferencesStore', () => ({
  usePreferencesStore: <T,>(selector: (state: Record<string, unknown>) => T) =>
    selector({
      shortcutOverrides: {},
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
  bulletList: 'Bullet list',
  orderedList: 'Ordered list',
  taskList: 'Task list',
  image: 'Image',
  codeBlock: 'Code block',
  table: 'Table',
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

describe('MarkdownEditor shell', () => {
  beforeEach(() => {
    dropzoneState.isDragAccept = false
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
  })

  it('does not mark non-empty documents as empty', () => {
    renderEditor('# Heading')

    expect(screen.getByTestId('markdown-editor-shell')).not.toHaveClass('is-empty-editor')
  })

  it('marks the shell while image drag is accepted', () => {
    dropzoneState.isDragAccept = true

    renderEditor('# Heading')

    expect(screen.getByTestId('markdown-editor-shell')).toHaveClass('is-image-drop-target')
  })
})
