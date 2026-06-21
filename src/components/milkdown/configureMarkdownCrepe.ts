import type { Crepe } from '@milkdown/crepe'
import { codeBlockConfig } from '@milkdown/kit/component/code-block'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import type { ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import { createMarkdownImageNodeView } from '@/components/milkdown/imageNodeView'
import { resolveMarkdownMediaSource } from '@/components/milkdown/markdownMediaSource'
import { resolveMarkdownPdfSource } from '@/components/milkdown/markdownPdfSource'
import { configureMermaidPreview } from '@/components/milkdown/mermaidPreview'
import { pasteLinkOnSelection } from '@/components/milkdown/pasteEnhancements'
import { animatedCursor } from '@/components/milkdown/animatedCursorPlugin'
import { mediaPreviewPlugin } from '@/components/milkdown/mediaPreviewPlugin'
import { pdfPreviewPlugin } from '@/components/milkdown/pdfPreviewPlugin'
import { typewriterScroll } from '@/components/milkdown/typewriterScrollPlugin'

export type NodeViewFactory = (options: ReactNodeViewUserOptions) => NodeViewConstructor

type ConfigureMarkdownCrepeOptions = {
  getImageDocumentPath: () => string | null
  nodeViewFactory: NodeViewFactory
  onMarkdownUpdated: (markdown: string) => void
  resolveImageSrc: (documentPath: string | null, src: string) => Promise<string>
  subscribeImageDocumentPath: (listener: () => void) => () => void
}

export const configureMarkdownCrepe = (
  crepe: Crepe,
  {
    getImageDocumentPath,
    nodeViewFactory,
    onMarkdownUpdated,
    resolveImageSrc,
    subscribeImageDocumentPath,
  }: ConfigureMarkdownCrepeOptions,
) => {
  crepe.editor
    .config((ctx) => {
      ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
        onMarkdownUpdated(markdown)
      })

      ctx.update(codeBlockConfig.key, configureMermaidPreview)
    })
    .use(listener)
    .use(
      createMarkdownImageNodeView(nodeViewFactory, {
        getDocumentPath: getImageDocumentPath,
        resolveImageSrc,
        subscribeDocumentPath: subscribeImageDocumentPath,
      }),
    )
    .use(
      pdfPreviewPlugin({
        getDocumentPath: getImageDocumentPath,
        resolvePdfSrc: resolveMarkdownPdfSource,
        subscribeDocumentPath: subscribeImageDocumentPath,
      }),
    )
    .use(
      mediaPreviewPlugin({
        getDocumentPath: getImageDocumentPath,
        resolveMediaSrc: resolveMarkdownMediaSource,
        subscribeDocumentPath: subscribeImageDocumentPath,
      }),
    )
    .use(pasteLinkOnSelection)
    .use(animatedCursor)
    .use(typewriterScroll)

  return crepe
}
