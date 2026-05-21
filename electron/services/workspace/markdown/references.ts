import { toString } from 'mdast-util-to-string'
import { visit } from 'unist-util-visit'

import type { FsMarkdownAsset, FsMarkdownLink } from '../types.js'
import {
  hasChildren,
  isDefinitionNode,
  isImageNode,
  isImageReferenceNode,
  isLinkNode,
  isLinkReferenceNode,
  isTextNode,
  lineAt,
  parseMarkdownAst,
  textOffsetPoint,
  type MarkdownNode,
  type MarkdownRoot,
} from './ast.js'
import { looksLikeAssetTarget } from './media.js'
import { createMarkdownAsset, createMarkdownLink } from './targets.js'
import { normalizeReferenceLabel } from './utils.js'

type ReferenceDefinition = {
  target: string
}

type InlineTarget = {
  text: string
  target: string
  type: 'markdown' | 'wiki'
  image: boolean
  line: number
  column: number
  context: string
}

const wikiTargetPattern = /!?\[\[([^\]\n]+?)]]/g

export const extractMarkdownReferences = (
  sourcePath: string,
  content: string,
  tree: MarkdownRoot,
): { links: FsMarkdownLink[]; assets: FsMarkdownAsset[] } => {
  const lines = content.split(/\r?\n/)
  const definitions = collectReferenceDefinitions(tree)
  const inlineTargets: InlineTarget[] = []

  visit(tree, (node) => {
    const directTarget = directMarkdownTarget(node, definitions, lines)
    if (directTarget) inlineTargets.push(directTarget)
  })

  collectWikiTargets(tree, lines, false, inlineTargets)

  const links: FsMarkdownLink[] = []
  const assets: FsMarkdownAsset[] = []

  for (const target of inlineTargets.sort((a, b) => a.line - b.line || a.column - b.column)) {
    if (target.image || looksLikeAssetTarget(target.target)) {
      assets.push(
        createMarkdownAsset(
          sourcePath,
          target.text,
          target.target,
          target.context,
          target.line,
          target.column,
        ),
      )
    } else {
      links.push(
        createMarkdownLink(
          sourcePath,
          target.text,
          target.target,
          target.type,
          target.context,
          target.line,
          target.column,
        ),
      )
    }
  }

  return { links, assets }
}

const collectReferenceDefinitions = (tree: MarkdownRoot): Map<string, ReferenceDefinition> => {
  const definitions = new Map<string, ReferenceDefinition>()

  visit(tree, (node) => {
    if (!isDefinitionNode(node)) return

    const keys = [node.identifier, node.label].filter((value): value is string =>
      Boolean(value?.trim()),
    )
    for (const key of keys) {
      definitions.set(normalizeReferenceLabel(key), { target: node.url })
    }
  })

  return definitions
}

const directMarkdownTarget = (
  node: MarkdownNode,
  definitions: Map<string, ReferenceDefinition>,
  lines: string[],
): InlineTarget | null => {
  if (isLinkNode(node)) return targetFromNode(node, toString(node).trim(), node.url, false, lines)
  if (isImageNode(node)) return targetFromNode(node, node.alt ?? '', node.url, true, lines)

  if (isLinkReferenceNode(node)) {
    const definition = definitions.get(normalizeReferenceLabel(node.identifier))
    if (!definition) return null
    return targetFromNode(node, toString(node).trim(), definition.target, false, lines)
  }

  if (isImageReferenceNode(node)) {
    const definition = definitions.get(normalizeReferenceLabel(node.identifier))
    if (!definition) return null
    return targetFromNode(node, node.alt ?? toString(node).trim(), definition.target, true, lines)
  }

  return null
}

const targetFromNode = (
  node: MarkdownNode,
  text: string,
  target: string,
  image: boolean,
  lines: string[],
): InlineTarget | null => {
  const start = node.position?.start
  if (!start || !target.trim()) return null

  return {
    text: text || target,
    target,
    type: 'markdown',
    image,
    line: start.line,
    column: start.column,
    context: lineAt(lines, start.line),
  }
}

const collectWikiTargets = (
  node: MarkdownNode,
  lines: string[],
  excluded: boolean,
  targets: InlineTarget[],
): void => {
  const nextExcluded = excluded || excludesWikiTargets(node)

  if (!nextExcluded && isTextNode(node) && node.position) {
    for (const target of wikiTargetsInText(node, lines)) targets.push(target)
  }

  if (!hasChildren(node)) return
  for (const child of node.children) collectWikiTargets(child, lines, nextExcluded, targets)
}

const excludesWikiTargets = (node: MarkdownNode): boolean => {
  return [
    'definition',
    'html',
    'inlineCode',
    'code',
    'link',
    'linkReference',
    'image',
    'imageReference',
  ].includes(node.type)
}

const wikiTargetsInText = (
  node: MarkdownNode & { value: string },
  lines: string[],
): InlineTarget[] => {
  const targets: InlineTarget[] = []
  const start = node.position?.start
  if (!start) return targets

  wikiTargetPattern.lastIndex = 0
  for (const match of node.value.matchAll(wikiTargetPattern)) {
    const raw = (match[1] ?? '').trim()
    const separator = raw.indexOf('|')
    const destination = (separator >= 0 ? raw.slice(0, separator) : raw).trim()
    const alias = separator >= 0 ? raw.slice(separator + 1).trim() : ''
    if (!destination) continue

    const matchText = match[0] ?? ''
    const point = textOffsetPoint(start, node.value, match.index ?? 0)
    targets.push({
      text: plainMarkdownText(alias || destination),
      target: destination,
      type: 'wiki',
      image: matchText.startsWith('![['),
      line: point.line,
      column: point.column,
      context: lineAt(lines, point.line),
    })
  }

  return targets
}

const plainMarkdownText = (value: string): string => {
  return toString(parseMarkdownAst(value)).replace(/\s+/g, ' ').trim()
}
