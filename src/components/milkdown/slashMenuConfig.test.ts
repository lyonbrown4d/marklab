import { commandsCtx, editorViewCtx, parserCtx } from '@milkdown/kit/core'
import { clearTextInCurrentBlockCommand, insertImageCommand } from '@milkdown/kit/preset/commonmark'
import { Slice } from '@milkdown/kit/prose/model'
import { describe, expect, it, vi } from 'vitest'
import {
  createSlashMenuConfig,
  type SlashCommandLabels,
} from '@/components/milkdown/slashMenuConfig'

const labels: SlashCommandLabels = {
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
}

describe('createSlashMenuConfig', () => {
  it('builds native slash groups from the shared editor command catalog', () => {
    const config = createSlashMenuConfig(labels, async () => true)

    expect(config.textGroup).toMatchObject({
      label: 'Text',
      text: { label: 'Text' },
      h1: { label: 'Heading 1' },
      h2: { label: 'Heading 2' },
      h3: { label: 'Heading 3' },
      h4: { label: 'Heading 4' },
      h5: { label: 'Heading 5' },
      h6: { label: 'Heading 6' },
      quote: { label: 'Quote · blockquote' },
      divider: { label: 'Divider · hr' },
    })
    expect(config.listGroup).toMatchObject({
      label: 'List',
      bulletList: { label: 'Bullet list' },
      orderedList: { label: 'Ordered list' },
      taskList: { label: 'Task list' },
    })
    expect(config.advancedGroup).toMatchObject({
      label: 'Advanced',
      image: null,
      codeBlock: { label: 'Code block · fence' },
      table: { label: 'Table' },
      math: null,
    })
  })

  it('clears slash text before running the custom image import command', () => {
    const onImageImport = vi.fn(async () => true)
    const config = createSlashMenuConfig(labels, onImageImport)
    const addItem = vi.fn()
    const builder = {
      getGroup: vi.fn(() => ({ addItem })),
    }

    config.buildMenu(builder)

    const [, item] = addItem.mock.calls[0] as [
      string,
      { onRun: (ctx: { get: () => { call: (key: string) => void } }) => void },
    ]
    const call = vi.fn()
    item.onRun({ get: () => ({ call }) })

    expect(builder.getGroup).toHaveBeenCalledWith('advanced')
    expect(addItem).toHaveBeenCalledWith(
      'image-import',
      expect.objectContaining({
        label: 'Image',
        icon: expect.stringContaining('<svg'),
      }),
    )
    expect(call).toHaveBeenCalledWith(clearTextInCurrentBlockCommand.key)
    expect(onImageImport).toHaveBeenCalledTimes(1)
  })

  it('registers markdown template slash commands from the shared catalog', () => {
    const config = createSlashMenuConfig(labels, async () => true)
    const addItem = vi.fn()

    config.buildMenu({
      getGroup: vi.fn(() => ({ addItem })),
    })

    expect(addItem).toHaveBeenCalledWith(
      'mermaid',
      expect.objectContaining({
        label: 'Mermaid diagram · diagram',
        icon: expect.stringContaining('<svg'),
      }),
    )
    expect(addItem).toHaveBeenCalledWith(
      'code-typescript',
      expect.objectContaining({ label: 'TypeScript code · ts' }),
    )
    expect(addItem).toHaveBeenCalledWith(
      'callout-warning',
      expect.objectContaining({ label: 'Warning callout · warn' }),
    )
    expect(addItem).toHaveBeenCalledWith('link', expect.objectContaining({ label: 'Link · url' }))
    expect(addItem).toHaveBeenCalledWith(
      'bold',
      expect.objectContaining({ label: 'Bold · strong' }),
    )
    expect(addItem).toHaveBeenCalledWith(
      'frontmatter',
      expect.objectContaining({ label: 'Frontmatter · yaml meta' }),
    )
    expect(addItem).toHaveBeenCalledWith(
      'details',
      expect.objectContaining({ label: 'Details · collapse' }),
    )
    expect(addItem).toHaveBeenCalledWith(
      'toc',
      expect.objectContaining({ label: 'Table of contents · contents' }),
    )
  })

  it('inserts custom markdown templates as parsed editor content', () => {
    const config = createSlashMenuConfig(labels, async () => true)
    const addItem = vi.fn()
    const call = vi.fn()
    const parser = vi.fn(() => ({ content: { childCount: 1 } }))
    const replaceRange = vi.fn(function replaceRange() {
      return tr
    })
    const scrollIntoView = vi.fn(function scrollIntoView() {
      return tr
    })
    const tr = { replaceRange, scrollIntoView }
    const view = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        selection: {
          $from: {
            after: vi.fn(() => 8),
            before: vi.fn(() => 2),
            depth: 1,
          },
          from: 4,
          to: 4,
        },
        tr,
      },
    }

    config.buildMenu({
      getGroup: vi.fn(() => ({ addItem })),
    })

    const [, item] = addItem.mock.calls.find(([key]) => key === 'mermaid') as [
      string,
      { onRun: (ctx: { get: (token: unknown) => unknown }) => void },
    ]

    item.onRun({
      get: (token) => {
        if (token === commandsCtx) return { call }
        if (token === editorViewCtx) return view
        if (token === parserCtx) return parser
        return null
      },
    })

    expect(call).toHaveBeenCalledWith(clearTextInCurrentBlockCommand.key)
    expect(parser).toHaveBeenCalledWith(expect.stringContaining('```mermaid'))
    expect(replaceRange).toHaveBeenCalledWith(2, 8, expect.any(Slice))
    expect(view.dispatch).toHaveBeenCalledWith(tr)
    expect(view.focus).toHaveBeenCalledTimes(1)
  })

  it('prompts for an image URL and inserts it through the native image command', () => {
    const config = createSlashMenuConfig(labels, async () => true)
    const addItem = vi.fn()
    const call = vi.fn()
    const focus = vi.fn()
    const prompt = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('https://example.com/image.png')
      .mockReturnValueOnce('Example image')

    config.buildMenu({
      getGroup: vi.fn(() => ({ addItem })),
    })

    const [, item] = addItem.mock.calls.find(([key]) => key === 'image-url') as [
      string,
      { onRun: (ctx: { get: (token: unknown) => unknown }) => void },
    ]

    item.onRun({
      get: (token) => {
        if (token === commandsCtx) return { call }
        if (token === editorViewCtx) return { focus }
        return null
      },
    })

    expect(prompt).toHaveBeenCalledWith('Enter image URL')
    expect(prompt).toHaveBeenCalledWith('Enter image description')
    expect(call).toHaveBeenCalledWith(clearTextInCurrentBlockCommand.key)
    expect(call).toHaveBeenCalledWith(insertImageCommand.key, {
      alt: 'Example image',
      src: 'https://example.com/image.png',
      title: '',
    })
    expect(focus).toHaveBeenCalledTimes(1)

    prompt.mockRestore()
  })

  it('prompts for a link and inserts a parsed markdown link', () => {
    const config = createSlashMenuConfig(labels, async () => true)
    const addItem = vi.fn()
    const call = vi.fn()
    const parser = vi.fn(() => ({ content: { childCount: 1 } }))
    const replaceRange = vi.fn(function replaceRange() {
      return tr
    })
    const scrollIntoView = vi.fn(function scrollIntoView() {
      return tr
    })
    const tr = { replaceRange, scrollIntoView }
    const view = {
      dispatch: vi.fn(),
      focus: vi.fn(),
      state: {
        selection: {
          $from: {
            after: vi.fn(() => 8),
            before: vi.fn(() => 2),
            depth: 1,
          },
          from: 4,
          to: 4,
        },
        tr,
      },
    }
    const prompt = vi
      .spyOn(window, 'prompt')
      .mockReturnValueOnce('https://example.com/docs')
      .mockReturnValueOnce('Docs')

    config.buildMenu({
      getGroup: vi.fn(() => ({ addItem })),
    })

    const [, item] = addItem.mock.calls.find(([key]) => key === 'link') as [
      string,
      { onRun: (ctx: { get: (token: unknown) => unknown }) => void },
    ]

    item.onRun({
      get: (token) => {
        if (token === commandsCtx) return { call }
        if (token === editorViewCtx) return view
        if (token === parserCtx) return parser
        return null
      },
    })

    expect(prompt).toHaveBeenCalledWith('Enter link URL')
    expect(prompt).toHaveBeenCalledWith('Enter link text')
    expect(call).toHaveBeenCalledWith(clearTextInCurrentBlockCommand.key)
    expect(parser).toHaveBeenCalledWith('[Docs](https://example.com/docs)\n')
    expect(replaceRange).toHaveBeenCalledWith(2, 8, expect.any(Slice))
    expect(view.dispatch).toHaveBeenCalledWith(tr)
    expect(view.focus).toHaveBeenCalledTimes(1)

    prompt.mockRestore()
  })
})
