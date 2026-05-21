import { parseMarkdownAst } from './markdown/ast.js'
import { extractHeadingEntries } from './markdown/headings.js'
import { extractMarkdownReferences } from './markdown/references.js'
import type { FsIndexedMarkdownFile } from './types.js'

export { diagnosticsForFile } from './markdown/diagnostics.js'
export { buildOutlineGraph, buildWorkspaceGraph } from './markdown/graph.js'
export { searchDocuments } from './markdown/search.js'
export { fileLabel, normalizeMarkdownTarget, targetIsMarkdown } from './markdown/utils.js'
export { guessMediaType } from './markdown/media.js'

export const parseMarkdownDocument = (
  sourcePath: string,
  content: string,
): FsIndexedMarkdownFile => {
  const tree = parseMarkdownAst(content)
  const headings = extractHeadingEntries(sourcePath, tree).map((entry) => entry.heading)
  const { links, assets } = extractMarkdownReferences(sourcePath, content, tree)

  return { path: sourcePath, headings, links, assets }
}
