import { createElement, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { linkSchema } from '@milkdown/kit/preset/commonmark'
import type { Node as ProseMirrorNode } from '@milkdown/kit/prose/model'
import { Plugin, PluginKey, type EditorState } from '@milkdown/kit/prose/state'
import { Decoration, DecorationSet, type EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'
import MarkdownMediaPreview, {
  type MarkdownMediaPreviewKind,
} from '@/components/milkdown/MarkdownMediaPreview'
import { markdownMediaKindForTarget } from '@/components/milkdown/markdownMediaSource'

type MediaPreviewPluginOptions = {
  getDocumentPath: () => string | null
  resolveMediaSrc: (documentPath: string | null, target: string) => Promise<string>
  subscribeDocumentPath: (listener: () => void) => () => void
}

type MediaLinkPreview = {
  href: string
  kind: MarkdownMediaPreviewKind
  title: string
}

type ResolvedMediaPreviewProps = MediaLinkPreview & {
  documentPath: string | null
  resolveMediaSrc: MediaPreviewPluginOptions['resolveMediaSrc']
}

const mediaPreviewPluginKey = new PluginKey<DecorationSet>('marklab-media-preview')
const widgetRoots = new WeakMap<HTMLElement, Root>()

const linkTitle = (href: string, title: string) => {
  if (title.trim()) return title.trim()
  return href.split(/[\\/]/).filter(Boolean).pop() ?? href
}

const readMarkAttr = (value: unknown) => (typeof value === 'string' ? value : '')

const ResolvedMediaPreview = ({
  documentPath,
  href,
  kind,
  resolveMediaSrc,
  title,
}: ResolvedMediaPreviewProps) => {
  const sourceKey = `${documentPath ?? ''}\u0000${href}`
  const [resolvedSource, setResolvedSource] = useState<{
    failed: boolean
    key: string
    src: string | null
  }>({
    failed: false,
    key: '',
    src: null,
  })
  const src = resolvedSource.key === sourceKey ? resolvedSource.src : null
  const failed = resolvedSource.key === sourceKey ? resolvedSource.failed : false

  useEffect(() => {
    let cancelled = false

    void resolveMediaSrc(documentPath, href)
      .then((nextSrc) => {
        if (!cancelled) {
          setResolvedSource({ failed: false, key: sourceKey, src: nextSrc })
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSource({ failed: true, key: sourceKey, src: null })
        }
      })

    return () => {
      cancelled = true
    }
  }, [documentPath, href, resolveMediaSrc, sourceKey])

  if (!src) {
    return createElement(
      'article',
      {
        className:
          'rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground shadow-sm',
        contentEditable: false,
      },
      failed ? '媒体预览不可用' : '正在加载媒体预览...',
    )
  }

  return createElement(MarkdownMediaPreview, { href, kind, src, title })
}

const mediaLinksInNode = (node: ProseMirrorNode, linkType: ReturnType<typeof linkSchema.type>) => {
  const links: MediaLinkPreview[] = []
  const seen = new Set<string>()

  node.descendants((child) => {
    if (!child.isText) return true

    for (const mark of child.marks) {
      if (mark.type !== linkType) continue
      const href = readMarkAttr(mark.attrs.href)
      const kind = markdownMediaKindForTarget(href)
      if (!kind || seen.has(href)) continue

      seen.add(href)
      links.push({
        href,
        kind,
        title: linkTitle(href, readMarkAttr(mark.attrs.title)),
      })
    }

    return true
  })

  return links
}

const createMediaPreviewWidget = (
  link: MediaLinkPreview,
  { getDocumentPath, resolveMediaSrc }: MediaPreviewPluginOptions,
) => {
  const host = document.createElement('div')
  host.contentEditable = 'false'
  const root = createRoot(host)
  widgetRoots.set(host, root)
  root.render(
    createElement(ResolvedMediaPreview, {
      documentPath: getDocumentPath(),
      href: link.href,
      kind: link.kind,
      resolveMediaSrc,
      title: link.title,
    }),
  )
  return host
}

const buildMediaPreviewDecorations = (
  state: EditorState,
  linkType: ReturnType<typeof linkSchema.type>,
  options: MediaPreviewPluginOptions,
) => {
  const decorations: Decoration[] = []

  state.doc.descendants((node, pos) => {
    if (!node.isTextblock) return true

    const links = mediaLinksInNode(node, linkType)
    links.forEach((link, index) => {
      decorations.push(
        Decoration.widget(pos + node.nodeSize, () => createMediaPreviewWidget(link, options), {
          destroy: (node) => {
            widgetRoots.get(node as HTMLElement)?.unmount()
            widgetRoots.delete(node as HTMLElement)
          },
          ignoreSelection: true,
          key: `${pos}:${index}:${link.href}`,
          side: 1,
        }),
      )
    })

    return false
  })

  return DecorationSet.create(state.doc, decorations)
}

const createMediaPreviewPluginView = (
  view: EditorView,
  { subscribeDocumentPath }: MediaPreviewPluginOptions,
) => {
  const unsubscribe = subscribeDocumentPath(() => {
    view.dispatch(view.state.tr.setMeta(mediaPreviewPluginKey, { refresh: true }))
  })

  return {
    destroy: unsubscribe,
  }
}

export const mediaPreviewPlugin = (options: MediaPreviewPluginOptions) =>
  $prose((ctx) => {
    const linkType = linkSchema.type(ctx)

    return new Plugin({
      key: mediaPreviewPluginKey,
      props: {
        decorations: (state) => mediaPreviewPluginKey.getState(state),
      },
      state: {
        init: (_, state) => buildMediaPreviewDecorations(state, linkType, options),
        apply: (tr, value, _oldState, newState) => {
          if (tr.docChanged || tr.getMeta(mediaPreviewPluginKey)?.refresh) {
            return buildMediaPreviewDecorations(newState, linkType, options)
          }
          return value.map(tr.mapping, tr.doc)
        },
      },
      view: (view) => createMediaPreviewPluginView(view, options),
    })
  })
