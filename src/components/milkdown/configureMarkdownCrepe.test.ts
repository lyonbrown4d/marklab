import { beforeEach, describe, expect, it, vi } from 'vitest'

const pluginMocks = vi.hoisted(() => ({
  animatedCursor: { name: 'animated-cursor' },
  blockquote: { name: 'blockquote-view' },
  divider: { name: 'divider-view' },
  embeddedPreview: { name: 'embedded-preview' },
  heading: { name: 'heading-view' },
  image: { name: 'image-view' },
  listener: { name: 'listener' },
  paragraph: { name: 'paragraph-view' },
  pasteLink: { name: 'paste-link' },
  typewriterScroll: { name: 'typewriter-scroll' },
}))

const creatorMocks = vi.hoisted(() => ({
  createMarkdownBlockNodeViews: vi.fn(() => [pluginMocks.blockquote, pluginMocks.divider]),
  createMarkdownHeadingNodeView: vi.fn(() => pluginMocks.heading),
  createMarkdownImageNodeView: vi.fn(() => pluginMocks.image),
  createMarkdownParagraphNodeView: vi.fn(() => pluginMocks.paragraph),
  embeddedPreviewPlugin: vi.fn(() => pluginMocks.embeddedPreview),
}))

vi.mock('@milkdown/kit/plugin/listener', () => ({
  listener: pluginMocks.listener,
  listenerCtx: Symbol('listenerCtx'),
}))

vi.mock('@/components/milkdown/blockNodeViews', () => ({
  createMarkdownBlockNodeViews: creatorMocks.createMarkdownBlockNodeViews,
}))

vi.mock('@/components/milkdown/headingNodeView', () => ({
  createMarkdownHeadingNodeView: creatorMocks.createMarkdownHeadingNodeView,
}))

vi.mock('@/components/milkdown/imageNodeView', () => ({
  createMarkdownImageNodeView: creatorMocks.createMarkdownImageNodeView,
}))

vi.mock('@/components/milkdown/paragraphNodeView', () => ({
  createMarkdownParagraphNodeView: creatorMocks.createMarkdownParagraphNodeView,
}))

vi.mock('@/components/milkdown/embeddedPreviewPlugin', () => ({
  embeddedPreviewPlugin: creatorMocks.embeddedPreviewPlugin,
}))

vi.mock('@/components/milkdown/markdownEditorMode', () => ({
  enableMarklabEditorEnhancements: false,
  enableMarklabEditorSharedBlockViews: true,
}))

vi.mock('@/components/milkdown/pasteEnhancements', () => ({
  pasteLinkOnSelection: pluginMocks.pasteLink,
}))

vi.mock('@/components/milkdown/animatedCursorPlugin', () => ({
  animatedCursor: pluginMocks.animatedCursor,
}))

vi.mock('@/components/milkdown/typewriterScrollPlugin', () => ({
  typewriterScroll: pluginMocks.typewriterScroll,
}))

describe('configureMarkdownCrepe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers shared block node views without enabling broader editor enhancements', async () => {
    const { configureMarkdownCrepe } = await import('@/components/milkdown/configureMarkdownCrepe')
    const editor = {
      config: vi.fn(() => editor),
      use: vi.fn(() => editor),
    }
    const nodeViewFactory = vi.fn()

    configureMarkdownCrepe({ editor } as unknown as Parameters<typeof configureMarkdownCrepe>[0], {
      getImageDocumentPath: () => null,
      nodeViewFactory,
      onMarkdownUpdated: vi.fn(),
      resolveImageSrc: vi.fn(),
      subscribeImageDocumentPath: vi.fn(),
    })

    expect(creatorMocks.createMarkdownHeadingNodeView).toHaveBeenCalledWith(nodeViewFactory)
    expect(creatorMocks.createMarkdownParagraphNodeView).toHaveBeenCalledWith(nodeViewFactory)
    expect(creatorMocks.createMarkdownBlockNodeViews).toHaveBeenCalledWith(nodeViewFactory)
    expect(creatorMocks.createMarkdownImageNodeView).not.toHaveBeenCalled()
    expect(creatorMocks.embeddedPreviewPlugin).not.toHaveBeenCalled()
    expect(editor.use).toHaveBeenCalledWith(pluginMocks.listener)
    expect(editor.use).toHaveBeenCalledWith(pluginMocks.heading)
    expect(editor.use).toHaveBeenCalledWith(pluginMocks.paragraph)
    expect(editor.use).toHaveBeenCalledWith(pluginMocks.blockquote)
    expect(editor.use).toHaveBeenCalledWith(pluginMocks.divider)
    expect(editor.use).not.toHaveBeenCalledWith(pluginMocks.pasteLink)
    expect(editor.use).not.toHaveBeenCalledWith(pluginMocks.animatedCursor)
    expect(editor.use).not.toHaveBeenCalledWith(pluginMocks.typewriterScroll)
  })
})
