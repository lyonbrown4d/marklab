import { linkSchema } from '@milkdown/kit/preset/commonmark'
import type { MarkType } from '@milkdown/kit/prose/model'
import { Plugin, TextSelection } from '@milkdown/kit/prose/state'
import { $prose } from '@milkdown/kit/utils'

const URL_WITH_PROTOCOL_PATTERN = /^https?:\/\/\S+$/i
const WWW_URL_PATTERN = /^www\.\S+\.\S+$/i

export const normalizePastedUrl = (value: string) => {
  const text = value.trim()
  if (text.length === 0 || /\s/.test(text)) return null
  if (URL_WITH_PROTOCOL_PATTERN.test(text)) return text
  if (WWW_URL_PATTERN.test(text)) return `https://${text}`
  return null
}

export const createPasteLinkOnSelectionPlugin = (linkType: MarkType) =>
  new Plugin({
    props: {
      // Run before Milkdown's clipboard parser consumes the paste.
      handleDOMEvents: {
        paste(view, event) {
          const { state } = view
          if (
            !view.editable ||
            !(state.selection instanceof TextSelection) ||
            state.selection.empty
          )
            return false

          const href = normalizePastedUrl(event.clipboardData?.getData('text/plain') ?? '')
          if (!href) return false

          const { from, to } = state.selection
          let hasText = false
          let allowsLink = true
          state.doc.nodesBetween(from, to, (node, _position, parent) => {
            if (!node.isText) return
            hasText = true
            if (
              !parent?.type.allowsMarkType(linkType) ||
              node.marks.some((mark) => mark.type.spec.code)
            )
              allowsLink = false
          })
          if (!hasText || !allowsLink) return false

          const transaction = state.tr.addMark(from, to, linkType.create({ href }))
          if (transaction.docChanged) view.dispatch(transaction.scrollIntoView())
          event.preventDefault()
          return true
        },
      },
    },
  })

export const pasteLinkOnSelection = $prose((ctx) =>
  createPasteLinkOnSelectionPlugin(linkSchema.type(ctx)),
)
