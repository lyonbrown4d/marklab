import type { Crepe } from '@milkdown/crepe'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import type { ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import { createMarkdownImageNodeView } from '@/components/milkdown/imageNodeView'
import { pasteLinkOnSelection } from '@/components/milkdown/pasteEnhancements'
import { animatedCursor } from '@/components/milkdown/animatedCursorPlugin'
import { embeddedPreviewPlugin } from '@/components/milkdown/embeddedPreviewPlugin'
import { enableMarklabEditorEnhancements } from '@/components/milkdown/markdownEditorMode'
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
    })
    .use(listener)

  if (enableMarklabEditorEnhancements) {
    crepe.editor
      .use(
        createMarkdownImageNodeView(nodeViewFactory, {
          getDocumentPath: getImageDocumentPath,
          resolveImageSrc,
          subscribeDocumentPath: subscribeImageDocumentPath,
        }),
      )
      .use(
        embeddedPreviewPlugin({
          getDocumentPath: getImageDocumentPath,
          subscribeDocumentPath: subscribeImageDocumentPath,
        }),
      )
      .use(pasteLinkOnSelection)
      .use(animatedCursor)
      .use(typewriterScroll)
  }

  return crepe
}
