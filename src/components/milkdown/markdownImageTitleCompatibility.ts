import type { Node } from '@milkdown/kit/transformer'
import { $remark } from '@milkdown/kit/utils'
import { visit } from 'unist-util-visit'

type MarkdownImageNode = Node & {
  title?: string | null
}

/**
 * Milkdown's image schema requires a string title, while mdast represents an
 * omitted Markdown image title as null. Normalize only that representation so
 * title-less images keep their original Markdown syntax and remain loadable.
 */
export const remarkImageTitleCompatibility = $remark(
  'marklabImageTitleCompatibility',
  () => () => (tree: Node) => {
    visit(tree, 'image', (node) => {
      const image = node as MarkdownImageNode
      if (image.title == null) image.title = ''
    })
  },
)
