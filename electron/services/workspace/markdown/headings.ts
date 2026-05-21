import { toString } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'

import type { FsMarkdownHeading } from '../types.js'
import type { MarkdownRoot } from './ast.js'
import { isHeadingNode } from './ast.js'
import { uniqueGithubSlug } from './slugs.js'

export type HeadingEntry = {
  heading: FsMarkdownHeading
  contentStartLine: number
}

export const extractHeadingEntries = (sourcePath: string, tree: MarkdownRoot): HeadingEntry[] => {
  const usedSlugs = new Map<string, number>()
  const headings: HeadingEntry[] = []

  visit(tree, (node) => {
    if (!isHeadingNode(node)) return

    const text = toString(node).trim()
    const start = node.position?.start
    const end = node.position?.end
    if (!text || !start) return

    headings.push({
      heading: {
        path: sourcePath,
        level: Math.min(Math.max(Math.trunc(node.depth), 1), 6),
        text,
        slug: uniqueGithubSlug(text, usedSlugs),
        line: start.line,
        column: start.column,
      },
      contentStartLine: (end?.line ?? start.line) + 1,
    })
  })

  return headings
}

export const headingLevelsByLine = (tree: MarkdownRoot): Map<number, number> => {
  const levels = new Map<number, number>()

  visit(tree, (node) => {
    if (!isHeadingNode(node)) return

    const line = node.position?.start.line
    if (line) levels.set(line, Math.min(Math.max(Math.trunc(node.depth), 1), 6))
  })

  return levels
}
