import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { linkSchema } from '@milkdown/kit/preset/commonmark'
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import EmbeddedFilePreview from '@/components/previews/EmbeddedFilePreview'
import { embeddedPreviewKindForTarget } from '@/components/previews/embeddedPreviewSource'

type EmbeddedPreviewPluginOptions = {
  getDocumentPath: () => string | null
  subscribeDocumentPath: (listener: () => void) => () => void
}

type EmbeddedLinkPreview = {
  href: string
  title: string
}

type TextLikeNode = {
  marks?: readonly { attrs: Record<string, unknown>; type: unknown }[]
  text?: string | null
}

const embeddedPreviewPluginKey = new PluginKey<DecorationSet>('marklab-embedded-preview')
const widgetRoots = new WeakMap<HTMLElement, Root>()

const linkTitle = (href: string, title: string) => {
  if (title.trim()) return title.trim()
  return href.split(/[\\/]/).filter(Boolean).pop() ?? href
}

const readMarkAttr = (value: unknown) => (typeof value === 'string' ? value : '')

export const markdownEmbeddedLinksInText = (text: string): EmbeddedLinkPreview[] => {
  const links: EmbeddedLinkPreview[] = []
  const seen = new Set<string>()
  const pattern = /\[([^\]\n]+)\]\(([^)\s]+(?:\s+['"][^'"]*['"])?[^)]*)\)/g
  let match = pattern.exec(text)

  while (match) {
    const rawHref = (match[2] ?? '').trim()
    const href = rawHref.replace(/\s+(['"]).*\1$/, '').trim()
    if (embeddedPreviewKindForTarget(href) && !seen.has(href)) {
      seen.add(href)
      links.push({
        href,
        title: linkTitle(href, match[1] ?? ''),
      })
    }
    match = pattern.exec(text)
  }

  return links
}

export const embeddedLinksInTextNode = (
  child: TextLikeNode,
  linkType: unknown,
  seen: Set<string>,
): EmbeddedLinkPreview[] => {
  const links: EmbeddedLinkPreview[] = []

  for (const mark of child.marks ?? []) {
    if (mark.type !== linkType) continue
    const href = readMarkAttr(mark.attrs.href)
    if (!embeddedPreviewKindForTarget(href) || seen.has(href)) continue

    seen.add(href)
    links.push({
      href,
      title: linkTitle(href, readMarkAttr(mark.attrs.title)),
    })
  }

  for (const link of markdownEmbeddedLinksInText(child.text ?? '')) {
    if (seen.has(link.href)) continue
    seen.add(link.href)
    links.push(link)
  }

  return links
}

const embeddedLinksInNode = (
  node: ProseMirrorNode,
  linkType: ReturnType<typeof linkSchema.type>,
) => {
  const links: EmbeddedLinkPreview[] = []
  const seen = new Set<string>()

  node.descendants((child) => {
    if (!child.isText) return true

    links.push(...embeddedLinksInTextNode(child, linkType, seen))

    return true
  })

  return links
}

const createEmbeddedPreviewWidget = (
  link: EmbeddedLinkPreview,
  { getDocumentPath }: EmbeddedPreviewPluginOptions,
) => {
  const host = document.createElement('div')
  const root = createRoot(host)
  widgetRoots.set(host, root)
  root.render(
    createElement(EmbeddedFilePreview, {
      documentPath: getDocumentPath(),
      target: link.href,
      title: link.title,
    }),
  )
  return host
}

const buildEmbeddedPreviewDecorations = (
  state: EditorState,
  linkType: ReturnType<typeof linkSchema.type>,
  options: EmbeddedPreviewPluginOptions,
) => {
  const decorations: Decoration[] = []

  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true

    const links = embeddedLinksInNode(node, linkType)
    links.forEach((link, index) => {
      decorations.push(
        Decoration.widget(pos + node.nodeSize, () => createEmbeddedPreviewWidget(link, options), {
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

const createEmbeddedPreviewPluginView = (
  view: EditorView,
  { subscribeDocumentPath }: EmbeddedPreviewPluginOptions,
) => {
  const unsubscribe = subscribeDocumentPath(() => {
    view.dispatch(view.state.tr.setMeta(embeddedPreviewPluginKey, { refresh: true }))
  })

  return {
    destroy: unsubscribe,
  }
}

export const embeddedPreviewPlugin = (options: EmbeddedPreviewPluginOptions) =>
  $prose((ctx) => {
    const linkType = linkSchema.type(ctx)

    return new Plugin({
      key: embeddedPreviewPluginKey,
      props: {
        decorations: (state) => embeddedPreviewPluginKey.getState(state),
      },
      state: {
        init: (_, state) => buildEmbeddedPreviewDecorations(state, linkType, options),
        apply: (tr, value, _oldState, newState) => {
          if (tr.docChanged || tr.getMeta(embeddedPreviewPluginKey)?.refresh) {
            return buildEmbeddedPreviewDecorations(newState, linkType, options)
          }
          return value.map(tr.mapping, tr.doc)
        },
      },
      view: (view) => createEmbeddedPreviewPluginView(view, options),
    })
  })
