import {
  convertChildrenDeserialize,
  serializeMd,
  type DeserializeMdOptions,
  type MdDecoration,
  type SerializeMdOptions,
} from '@platejs/markdown'
import type { Descendant, TElement, TText, Value } from 'platejs'
import { safeHtmlUrl } from '@/components/plate/html/plateHtmlAst'
import {
  PLATE_HTML_BR,
  PLATE_HTML_COMMENT,
  PLATE_HTML_DETAILS,
  PLATE_HTML_KBD,
  PLATE_HTML_SUMMARY,
  type PlateHtmlCommentNode,
  type PlateHtmlDetailsNode,
  type PlateHtmlInlineNode,
} from '@/components/plate/html/plateHtmlTypes'

type HtmlCommentText = TText & { htmlCommentSource?: string }

const editorType = (options: DeserializeMdOptions, key: string) =>
  options.editor?.getType(key) ?? key

const readText = (node: Descendant): string => {
  if ('text' in node) return typeof node.text === 'string' ? node.text : ''
  return node.children.map(readText).join('')
}

const escapeHtmlText = (value: string) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')

const escapeHtmlAttribute = (value: string) => escapeHtmlText(value).replaceAll('"', '&quot;')

const serializeSummaryNode = (node: Descendant): string => {
  if ('text' in node) {
    const leaf = node as TText & {
      bold?: boolean
      code?: boolean
      italic?: boolean
      strikethrough?: boolean
    }
    let content = escapeHtmlText(typeof leaf.text === 'string' ? leaf.text : '')
    if (leaf.code) content = `<code>${content}</code>`
    if (leaf.bold) content = `<strong>${content}</strong>`
    if (leaf.italic) content = `<em>${content}</em>`
    if (leaf.strikethrough) content = `<s>${content}</s>`
    return content
  }
  const content = node.children.map(serializeSummaryNode).join('')
  if (node.type === PLATE_HTML_KBD) return `<kbd>${content}</kbd>`
  if (node.type === PLATE_HTML_BR) return '<br>'
  if (node.type === 'a') {
    const link = node as TElement & { title?: string | null; url?: string }
    const url = safeHtmlUrl(link.url)
    if (!url) return content
    const title = link.title ? ` title="${escapeHtmlAttribute(link.title)}"` : ''
    return `<a href="${escapeHtmlAttribute(url)}"${title}>${content}</a>`
  }
  return content
}

export const serializeHtmlCommentParagraph = (node: TElement) => {
  if (
    node.children.length === 0 ||
    !node.children.every(
      (child) => 'text' in child && Boolean((child as HtmlCommentText).htmlCommentSource),
    )
  ) {
    return null
  }
  return {
    type: 'html' as const,
    value: node.children
      .map((child) => (child as HtmlCommentText).htmlCommentSource ?? '')
      .join(''),
  }
}

export const plateHtmlMarkdownRules = {
  [PLATE_HTML_COMMENT]: {
    deserialize: (node: PlateHtmlCommentNode) => ({
      htmlCommentSource: node.value,
      text: '',
    }),
    mark: true,
    serialize: (node: HtmlCommentText) => ({
      type: 'html',
      value: node.htmlCommentSource ?? '',
    }),
  },
  [PLATE_HTML_DETAILS]: {
    deserialize: (
      node: PlateHtmlDetailsNode,
      decoration: MdDecoration,
      options: DeserializeMdOptions,
    ) => ({
      children: [
        {
          children: convertChildrenDeserialize(
            node.summaryChildren as Parameters<typeof convertChildrenDeserialize>[0],
            decoration,
            options,
          ),
          type: editorType(options, PLATE_HTML_SUMMARY),
        },
        ...convertChildrenDeserialize(
          node.children as Parameters<typeof convertChildrenDeserialize>[0],
          decoration,
          options,
        ),
      ],
      open: node.open,
      type: editorType(options, PLATE_HTML_DETAILS),
    }),
    serialize: (node: TElement & { open?: boolean }, options: SerializeMdOptions) => {
      const [summary, ...content] = node.children
      const summarySource = `<summary>${serializeSummaryNode(summary)}</summary>`
      if (!options.editor) throw new Error('Plate editor is required to serialize HTML details.')
      const contentMarkdown = serializeMd(options.editor, { value: content as Value }).trimEnd()
      return {
        type: 'html',
        value: [
          node.open === true ? '<details open>' : '<details>',
          summarySource,
          ...(contentMarkdown ? ['', contentMarkdown, ''] : []),
          '</details>',
        ].join('\n'),
      }
    },
  },
  [PLATE_HTML_KBD]: {
    deserialize: (
      node: PlateHtmlInlineNode,
      decoration: MdDecoration,
      options: DeserializeMdOptions,
    ) => ({
      children: convertChildrenDeserialize(
        (node.children ?? []) as Parameters<typeof convertChildrenDeserialize>[0],
        decoration,
        options,
      ),
      type: editorType(options, PLATE_HTML_KBD),
    }),
    serialize: (node: TElement) => ({
      type: 'html',
      value: `<kbd>${escapeHtmlText(readText(node))}</kbd>`,
    }),
  },
  [PLATE_HTML_BR]: {
    deserialize: (
      _node: PlateHtmlInlineNode,
      _decoration: unknown,
      options: DeserializeMdOptions,
    ) => ({
      children: [{ text: '' }],
      type: editorType(options, PLATE_HTML_BR),
    }),
    serialize: () => ({ type: 'html', value: '<br>' }),
  },
}
