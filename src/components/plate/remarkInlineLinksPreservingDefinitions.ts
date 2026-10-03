import type { MdHtml, MdParagraph, MdRoot, MdRootContent } from '@platejs/markdown'
import remarkInlineLinks from 'remark-inline-links'
import type { Plugin } from 'unified'
import { visit } from 'unist-util-visit'

type MdParent = { children: MdRootContent[] }

type PreservedDefinition = {
  index: number
  parent: MdParent
  raw: string
}

const sourceSlice = (source: string, node: { position?: MdRootContent['position'] }) => {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (start === undefined || end === undefined) return null
  return source.slice(start, end)
}

export const remarkInlineLinksPreservingDefinitions: Plugin = () => {
  const inlineLinks = remarkInlineLinks()

  return (tree, file) => {
    const root = tree as MdRoot
    const source = String(file.value)
    const definitions: PreservedDefinition[] = []

    visit(root, 'definition', (node, index, parent) => {
      const raw = sourceSlice(source, node)
      if (!parent || index === undefined || raw === null) return
      definitions.push({ index, parent: parent as MdParent, raw })
    })

    inlineLinks(root)

    for (const definition of definitions) {
      const html: MdHtml = { type: 'html', value: definition.raw }
      const paragraph: MdParagraph = { children: [html], type: 'paragraph' }
      definition.parent.children.splice(definition.index, 0, paragraph)
    }
  }
}
