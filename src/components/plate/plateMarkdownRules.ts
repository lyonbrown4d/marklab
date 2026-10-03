import {
  convertChildrenDeserialize,
  convertNodesSerialize,
  defaultRules,
  type DeserializeMdOptions,
  type MdDecoration,
  type MdHtml,
  type MdLink,
  type MdList,
  type MdListItem,
  type MdParagraph,
  type MdRules,
  type MdYaml,
  type SerializeMdOptions,
} from '@platejs/markdown'
import { KEYS, type Descendant, type TElement, type TText } from 'platejs'
import { tableMarkdownAlignmentRules } from '@/components/plate/nodes/tableMarkdownAlignmentRules'
import { CALLOUT_MARKER_PROPERTY } from '@/components/plate/remarkCalloutMarker'

type PreservedMarkdownKind = 'html' | 'yaml'

type PreservedMarkdownElement = TElement & {
  preservedMarkdownKind?: PreservedMarkdownKind
}

type PreservedMarkdownText = TText & {
  preservedMarkdownKind?: PreservedMarkdownKind
}

const readText = (node: TElement) =>
  node.children.map((child) => ('text' in child ? child.text : '')).join('')

const serializeParagraph = defaultRules.p?.serialize
const serializeLink = defaultRules.a?.serialize

const editorType = (options: DeserializeMdOptions | SerializeMdOptions, key: string) =>
  options.editor?.getType(key) ?? key

const taskState = (item: MdListItem, preserveUncheckedItem: boolean) => {
  if (typeof item.checked === 'boolean') return { checked: item.checked }
  if (preserveUncheckedItem) return { checked: null }
  return {}
}

const deserializeClassicListItem = (
  item: MdListItem,
  decoration: MdDecoration,
  options: DeserializeMdOptions,
  preserveUncheckedItem: boolean,
) => {
  const contentType = editorType(options, KEYS.lic)
  const children = item.children.flatMap((child) => {
    if (child.type === 'paragraph') {
      return [
        {
          children: convertChildrenDeserialize(child.children, decoration, options),
          type: contentType,
        },
      ]
    }
    return convertChildrenDeserialize([child], decoration, options)
  })

  if (!children.some((child) => 'type' in child && child.type === contentType)) {
    children.unshift({ children: [{ text: '' }], type: contentType })
  }

  return {
    ...taskState(item, preserveUncheckedItem),
    children,
    type: editorType(options, KEYS.li),
  }
}

const serializeClassicList = (node: TElement & { start?: number }, options: SerializeMdOptions) => {
  const numberedType = editorType(options, KEYS.olClassic)
  const itemType = editorType(options, KEYS.li)
  const contentType = editorType(options, KEYS.lic)
  const isOrdered = node.type === numberedType || node.ordered === true

  const children = node.children
    .filter((child): child is TElement => 'type' in child && child.type === itemType)
    .map((item): MdListItem => {
      const itemChildren = item.children.flatMap((child) => {
        if ('type' in child && child.type === contentType) {
          const content = child as TElement
          return [
            {
              children: convertNodesSerialize(content.children, options),
              type: 'paragraph' as const,
            } as MdParagraph,
          ]
        }
        return convertNodesSerialize([child] as Descendant[], options)
      }) as MdListItem['children']

      return {
        checked: typeof item.checked === 'boolean' ? item.checked : null,
        children: itemChildren,
        spread: itemChildren.length > 1,
        type: 'listItem',
      }
    })

  return {
    children,
    ordered: isOrdered,
    spread: children.some((item) => item.spread),
    start: isOrdered ? node.start : undefined,
    type: 'list',
  } satisfies MdList
}

const preservationRules = {
  ...tableMarkdownAlignmentRules,
  a: {
    ...defaultRules.a,
    deserialize: (node: MdLink, decoration: MdDecoration, options: DeserializeMdOptions) => ({
      children: convertChildrenDeserialize(node.children, decoration, options),
      title: node.title,
      type: options.editor?.getType('a') ?? 'a',
      url: node.url,
    }),
    serialize: (
      node: TElement & { title?: string | null; url: string },
      options: SerializeMdOptions,
    ) => {
      if (!serializeLink) throw new Error('Plate link Markdown serializer is unavailable.')
      if (node.title) {
        return {
          children: convertNodesSerialize(node.children, options),
          title: node.title,
          type: 'link',
          url: node.url,
        }
      }
      const link = serializeLink(node as Parameters<NonNullable<typeof serializeLink>>[0], options)
      return link.type === 'link' ? { ...link, title: node.title } : link
    },
  },
  [CALLOUT_MARKER_PROPERTY]: {
    deserialize: (node: { value: string }) => ({
      [CALLOUT_MARKER_PROPERTY]: true,
      text: node.value,
    }),
    mark: true,
    serialize: (node: TText) => ({ type: 'html', value: node.text }),
  },
  html: {
    deserialize: (node: MdHtml) => ({
      preservedMarkdownKind: 'html',
      text: node.value ?? '',
    }),
  },
  list: {
    deserialize: (node: MdList, decoration: MdDecoration, options: DeserializeMdOptions) => {
      const isTaskList = node.children.some(
        (child) => child.type === 'listItem' && typeof child.checked === 'boolean',
      )
      let listType: string = KEYS.ulClassic
      if (isTaskList) listType = KEYS.taskList
      else if (node.ordered) listType = KEYS.olClassic

      return {
        children: node.children
          .filter((child): child is MdListItem => child.type === 'listItem')
          .map((child) => deserializeClassicListItem(child, decoration, options, isTaskList)),
        ...(isTaskList && node.ordered ? { ordered: true } : {}),
        ...(node.ordered && node.start !== null && node.start !== undefined
          ? { start: node.start }
          : {}),
        type: editorType(options, listType),
      }
    },
    serialize: serializeClassicList,
  },
  [KEYS.taskList]: {
    serialize: serializeClassicList,
  },
  p: {
    serialize: (node: TElement, options: SerializeMdOptions) => {
      const preservedNode = node as PreservedMarkdownElement
      if (preservedNode.preservedMarkdownKind === 'yaml') {
        return { type: 'yaml', value: readText(preservedNode) }
      }
      if (
        node.children.length > 0 &&
        node.children.every(
          (child) =>
            'text' in child && (child as PreservedMarkdownText).preservedMarkdownKind === 'html',
        )
      ) {
        return { type: 'html', value: readText(node) }
      }
      if (
        node.children.some((child) => 'text' in child && Boolean(child[CALLOUT_MARKER_PROPERTY]))
      ) {
        return { children: convertNodesSerialize(node.children, options), type: 'paragraph' }
      }

      if (!serializeParagraph)
        throw new Error('Plate paragraph Markdown serializer is unavailable.')
      return serializeParagraph(node, { ...options, preserveEmptyParagraphs: false })
    },
  },
  preservedMarkdownKind: {
    mark: true,
    serialize: (node: PreservedMarkdownText) => {
      const preservedNode = node as PreservedMarkdownText
      if (preservedNode.preservedMarkdownKind === 'html') {
        return { type: 'html', value: preservedNode.text }
      }
      return { type: 'text', value: preservedNode.text }
    },
  },
  yaml: {
    deserialize: (node: MdYaml, _decoration: unknown, options: DeserializeMdOptions) => ({
      children: [{ text: node.value ?? '' }],
      preservedMarkdownKind: 'yaml',
      type: options.editor?.getType('p') ?? 'p',
    }),
  },
}

export const plateMarkdownRules = preservationRules as unknown as MdRules
