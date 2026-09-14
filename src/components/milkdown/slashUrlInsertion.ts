import { editorViewCtx } from '@milkdown/kit/core'
import type { Ctx } from '@milkdown/kit/ctx'
import { Selection } from '@milkdown/kit/prose/state'

export type SlashUrlValues = { url: string; text: string }

export type SlashUrlInsertionRequest = {
  kind: 'link' | 'image-url'
  initialText: string
  insert: (values: SlashUrlValues) => void
  invalidate: () => void
  restoreFocus: () => void
}

export const captureSlashUrlInsertion = (
  ctx: Ctx,
  kind: SlashUrlInsertionRequest['kind'],
  options: { consumeSlash?: boolean } = {},
): SlashUrlInsertionRequest => {
  const view = ctx.get(editorViewCtx)
  const { doc, selection, schema } = view.state
  const prefix = selection.$from.parent.textBetween(0, selection.$from.parentOffset)
  const slash =
    options.consumeSlash !== false && selection.empty
      ? /(?:^|\s)(\/[^\s/]*)$/.exec(prefix)?.[1]
      : undefined
  const from = selection.from - (slash?.length ?? 0)
  const to = selection.to
  let targetDoc = doc
  let active = true
  let inserted = false
  const isCurrent = () => active && !view.isDestroyed && view.state.doc === targetDoc

  return {
    kind,
    initialText: selection.empty ? '' : doc.textBetween(selection.from, to, ' '),
    invalidate: () => {
      active = false
    },
    restoreFocus: () => {
      if (!isCurrent()) return
      if (!inserted) view.dispatch(view.state.tr.setSelection(selection))
      view.focus()
    },
    insert: ({ url, text }) => {
      if (!isCurrent() || inserted) throw new Error('The insertion target is no longer current')
      const destination = url.trim()
      if (!destination) throw new Error('A URL is required')
      // Native nodes keep user text literal; Milkdown owns Markdown escaping on serialization.
      const node =
        kind === 'link'
          ? schema.text(text.trim() || destination, [
              schema.marks.link.create({ href: destination }),
            ])
          : schema.nodes.image.create({ src: destination, alt: text.trim(), title: '' })
      const tr = view.state.tr.replaceWith(from, to, node)
      tr.setSelection(Selection.near(tr.doc.resolve(tr.mapping.map(to, 1))))
      view.dispatch(tr.scrollIntoView())
      targetDoc = view.state.doc
      inserted = true
    },
  }
}
