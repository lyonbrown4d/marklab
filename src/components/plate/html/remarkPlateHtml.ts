import type { MdParagraph, MdRoot } from '@platejs/markdown'
import type { Plugin } from 'unified'
import {
  asHtml,
  isClosingDetails,
  isHtmlComment,
  isOpeningKbd,
  isStandaloneBr,
  parseDetailsStart,
  parseFullKbd,
  parseStandaloneImage,
} from '@/components/plate/html/plateHtmlAst'
import {
  PLATE_HTML_BR,
  PLATE_HTML_COMMENT,
  PLATE_HTML_DETAILS,
  PLATE_HTML_KBD,
} from '@/components/plate/html/plateHtmlTypes'

type UnknownMdNode = { children?: UnknownMdNode[]; type: string; value?: string }
type UnknownMdParent = UnknownMdNode & { children: UnknownMdNode[] }

const transformPhrasing = (parent: UnknownMdParent): void => {
  for (let index = 0; index < parent.children.length; index += 1) {
    const node = parent.children[index]
    const html = asHtml(node)
    if (!html) {
      if (node.children) transformPhrasing(node as UnknownMdParent)
      continue
    }
    if (isHtmlComment(html.value)) {
      parent.children.splice(index, 1, {
        type: PLATE_HTML_COMMENT,
        value: html.value,
      } as UnknownMdNode)
      continue
    }
    if (isStandaloneBr(html.value)) {
      parent.children.splice(index, 1, { type: PLATE_HTML_BR } as UnknownMdNode)
      continue
    }
    const fullKbd = parseFullKbd(html.value)
    if (fullKbd) {
      parent.children.splice(index, 1, {
        children: fullKbd as UnknownMdNode[],
        type: PLATE_HTML_KBD,
      })
      continue
    }
    if (!isOpeningKbd(html.value)) continue
    const closingIndex = parent.children.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex > index && Boolean(asHtml(candidate)?.value.match(/^\s*<\/kbd\s*>\s*$/i)),
    )
    if (closingIndex < 0) continue
    const children = parent.children.slice(index + 1, closingIndex)
    parent.children.splice(index, closingIndex - index + 1, {
      children,
      type: PLATE_HTML_KBD,
    })
  }
}

const transformParsedNodes = (parent: UnknownMdParent): void => {
  for (let index = 0; index < parent.children.length; index += 1) {
    const node = parent.children[index]
    if (node.type === 'paragraph') {
      transformPhrasing(node as UnknownMdParent)
      continue
    }
    const html = asHtml(node)
    if (html && isHtmlComment(html.value)) {
      parent.children.splice(index, 1, {
        type: PLATE_HTML_COMMENT,
        value: html.value,
      } as UnknownMdNode)
      continue
    }
    const details = html ? parseDetailsStart(html.value) : null
    if (details) {
      const closingIndex = parent.children.findIndex(
        (candidate, candidateIndex) =>
          candidateIndex > index && isClosingDetails(asHtml(candidate)?.value ?? ''),
      )
      if (closingIndex >= 0) {
        const children = parent.children.slice(index + 1, closingIndex)
        transformParsedNodes({ children, type: 'root' })
        parent.children.splice(index, closingIndex - index + 1, {
          ...details,
          children,
          type: PLATE_HTML_DETAILS,
        } as UnknownMdNode)
        continue
      }
    }
    const image = html ? parseStandaloneImage(html.value) : null
    if (image) {
      parent.children.splice(index, 1, {
        children: [image],
        type: 'paragraph',
      } as MdParagraph as UnknownMdNode)
      continue
    }
    if (node.children) transformParsedNodes(node as UnknownMdParent)
  }
}

export const remarkPlateHtml: Plugin = () => (tree) => {
  const root = tree as MdRoot as unknown as UnknownMdParent
  transformParsedNodes(root)
}
