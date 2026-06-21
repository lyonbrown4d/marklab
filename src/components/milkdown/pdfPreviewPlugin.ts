import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { linkSchema } from '@milkdown/kit/preset/commonmark'
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import MarkdownPdfPreview from '@/components/milkdown/MarkdownPdfPreview'
import { isMarkdownPdfTarget } from '@/components/milkdown/markdownPdfSource'

type PdfPreviewPluginOptions = {
  getDocumentPath: () => string | null
  resolvePdfSrc: (documentPath: string | null, target: string) => Promise<string>
  subscribeDocumentPath: (listener: () => void) => () => void
}

type PdfLinkPreview = {
  href: string
  title: string
}

const pdfPreviewPluginKey = new PluginKey<DecorationSet>('marklab-pdf-preview')
const widgetRoots = new WeakMap<HTMLElement, Root>()

const linkTitle = (href: string, title: string) => {
  if (title.trim()) return title.trim()
  return href.split(/[\\/]/).filter(Boolean).pop() ?? href
}

const readMarkAttr = (value: unknown) => (typeof value === 'string' ? value : '')

const pdfLinksInNode = (node: ProseMirrorNode, linkType: ReturnType<typeof linkSchema.type>) => {
  const links: PdfLinkPreview[] = []
  const seen = new Set<string>()

  node.descendants((child) => {
    if (!child.isText) return true

    for (const mark of child.marks) {
      if (mark.type !== linkType) continue
      const href = readMarkAttr(mark.attrs.href)
      if (!isMarkdownPdfTarget(href) || seen.has(href)) continue

      seen.add(href)
      links.push({
        href,
        title: linkTitle(href, readMarkAttr(mark.attrs.title)),
      })
    }

    return true
  })

  return links
}

const createPdfPreviewWidget = (
  link: PdfLinkPreview,
  { getDocumentPath, resolvePdfSrc }: PdfPreviewPluginOptions,
) => {
  const host = document.createElement('div')
  const root = createRoot(host)
  widgetRoots.set(host, root)
  root.render(
    createElement(MarkdownPdfPreview, {
      documentPath: getDocumentPath(),
      href: link.href,
      resolvePdfSrc,
      title: link.title,
    }),
  )
  return host
}

const buildPdfPreviewDecorations = (
  state: EditorState,
  linkType: ReturnType<typeof linkSchema.type>,
  options: PdfPreviewPluginOptions,
) => {
  const decorations: Decoration[] = []

  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true

    const links = pdfLinksInNode(node, linkType)
    links.forEach((link, index) => {
      decorations.push(
        Decoration.widget(pos + node.nodeSize, () => createPdfPreviewWidget(link, options), {
          destroy: (node) => {
            widgetRoots.get(node as HTMLElement)?.unmount()
            widgetRoots.delete(node as HTMLElement)
          },
          key: `${pos}:${index}:${link.href}`,
          side: 1,
        }),
      )
    })

    return false
  })

  return DecorationSet.create(state.doc, decorations)
}

const createPdfPreviewPluginView = (
  view: EditorView,
  { subscribeDocumentPath }: PdfPreviewPluginOptions,
) => {
  const unsubscribe = subscribeDocumentPath(() => {
    view.dispatch(view.state.tr.setMeta(pdfPreviewPluginKey, { refresh: true }))
  })

  return {
    destroy: unsubscribe,
  }
}

export const pdfPreviewPlugin = (options: PdfPreviewPluginOptions) =>
  $prose((ctx) => {
    const linkType = linkSchema.type(ctx)

    return new Plugin({
      key: pdfPreviewPluginKey,
      props: {
        decorations: (state) => pdfPreviewPluginKey.getState(state),
      },
      state: {
        init: (_, state) => buildPdfPreviewDecorations(state, linkType, options),
        apply: (tr, value, _oldState, newState) => {
          if (tr.docChanged || tr.getMeta(pdfPreviewPluginKey)?.refresh) {
            return buildPdfPreviewDecorations(newState, linkType, options)
          }
          return value.map(tr.mapping, tr.doc)
        },
      },
      view: (view) => createPdfPreviewPluginView(view, options),
    })
  })
