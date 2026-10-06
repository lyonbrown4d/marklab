import { parseMarkdownAst, type MarkdownRoot } from '@electron/services/workspace/markdown/ast'
import { extractHeadingEntries } from '@electron/services/workspace/markdown/headings'
import { extractMarkdownReferences } from '@electron/services/workspace/markdown/references'
import type { FsIndexedMarkdownFile } from '@electron/services/workspace/types'

export { diagnosticsForFile } from '@electron/services/workspace/markdown/diagnostics'
export {
  fileLabel,
  normalizeMarkdownTarget,
  targetIsMarkdown,
} from '@electron/services/workspace/markdown/utils'
export { guessMediaType } from '@electron/services/workspace/markdown/media'

export const parseMarkdownDocument = (
  sourcePath: string,
  content: string,
  tree: MarkdownRoot = parseMarkdownAst(content),
): FsIndexedMarkdownFile => {
  const headings = extractHeadingEntries(sourcePath, tree).map((entry) => entry.heading)
  const { links, assets } = extractMarkdownReferences(sourcePath, content, tree)

  return { path: sourcePath, headings, links, assets }
}
