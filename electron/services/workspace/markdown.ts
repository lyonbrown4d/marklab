import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast.js'
import { extractHeadingEntries } from '@electron/services/workspace/markdown/headings.js'
import { extractMarkdownReferences } from '@electron/services/workspace/markdown/references.js'
import type { FsIndexedMarkdownFile } from '@electron/services/workspace/types.js'

export { diagnosticsForFile } from '@electron/services/workspace/markdown/diagnostics.js'
export {
  buildOutlineGraph,
  buildWorkspaceGraph,
} from '@electron/services/workspace/markdown/graph.js'
export { searchDocuments } from '@electron/services/workspace/markdown/search.js'
export {
  fileLabel,
  normalizeMarkdownTarget,
  targetIsMarkdown,
} from '@electron/services/workspace/markdown/utils.js'
export { guessMediaType } from '@electron/services/workspace/markdown/media.js'

export const parseMarkdownDocument = (
  sourcePath: string,
  content: string,
): FsIndexedMarkdownFile => {
  const tree = parseMarkdownAst(content)
  const headings = extractHeadingEntries(sourcePath, tree).map((entry) => entry.heading)
  const { links, assets } = extractMarkdownReferences(sourcePath, content, tree)

  return { path: sourcePath, headings, links, assets }
}
