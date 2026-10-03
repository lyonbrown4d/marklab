import type {
  MDPhrasingContent,
  MdBlockquote,
  MdParagraph,
  MdRoot,
  MdText,
} from '@platejs/markdown'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

export const CALLOUT_MARKER_PROPERTY = 'calloutMarker'

type CalloutMarkerNode = {
  type: typeof CALLOUT_MARKER_PROPERTY
  value: string
}

const CALLOUT_MARKER = /^\[![A-Za-z][A-Za-z0-9_-]*\]/

const getLeadingText = (node: MdBlockquote) => {
  const paragraph = node.children[0]
  if (paragraph?.type !== 'paragraph') return null
  const text = paragraph.children[0]
  if (text?.type !== 'text') return null
  return { paragraph, text }
}

const splitCalloutMarker = (paragraph: MdParagraph, text: MdText, marker: string) => {
  const remainder = text.value.slice(marker.length)
  const hasLineBreak = remainder.startsWith('\n')
  const markerNode: CalloutMarkerNode = {
    type: CALLOUT_MARKER_PROPERTY,
    value: hasLineBreak ? `${marker}\n` : marker,
  }
  const replacement: MDPhrasingContent[] = [markerNode as unknown as MDPhrasingContent]
  const trailingText = hasLineBreak ? remainder.slice(1) : remainder
  if (trailingText) replacement.push({ ...text, value: trailingText })
  paragraph.children.splice(0, 1, ...replacement)
}

export const remarkCalloutMarker: Plugin = () => (tree, file) => {
  const source = String(file.value)
  const root = tree as MdRoot

  visit(root, 'blockquote', (node: MdBlockquote) => {
    const leading = getLeadingText(node)
    if (!leading) return
    const marker = CALLOUT_MARKER.exec(leading.text.value)?.[0]
    const offset = leading.text.position?.start.offset
    if (!marker || offset === undefined || !source.startsWith(marker, offset)) return
    splitCalloutMarker(leading.paragraph, leading.text, marker)
  })
}
