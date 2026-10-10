import { visit } from 'unist-util-visit'
import { parseDocument as parseYamlDocument } from 'yaml'

import {
  isHeadingNode,
  isImageNode,
  isImageReferenceNode,
  isTextNode,
  rawNodeText,
  textOffsetPoint,
  type MarkdownNode,
  type MarkdownRoot,
} from '@electron/services/workspace/markdown/ast'
import { normalizeReferenceLabel } from '@electron/services/workspace/markdown/utils'
import type { FsMarkdownDiagnostic } from '@electron/services/workspace/types'

type PositionedFootnote = {
  identifier: string
  node: MarkdownNode
}

type YamlIssue = {
  message: string
  pos?: readonly number[]
}

export const structuralDiagnosticsForMarkdown = (
  content: string,
  tree: MarkdownRoot,
): FsMarkdownDiagnostic[] => {
  const diagnostics = [
    ...headingLevelDiagnostics(tree),
    ...footnoteDiagnostics(content, tree),
    ...frontmatterDiagnostics(content, tree),
    ...imageAltDiagnostics(tree),
  ]
  return diagnostics.sort(
    (left, right) => left.line - right.line || left.start_column - right.start_column,
  )
}

const headingLevelDiagnostics = (tree: MarkdownRoot): FsMarkdownDiagnostic[] => {
  const diagnostics: FsMarkdownDiagnostic[] = []
  let previousLevel: number | null = null

  visit(tree, (node) => {
    if (!isHeadingNode(node) || !node.position) return
    const level = Math.min(Math.max(Math.trunc(node.depth), 1), 6)
    if (previousLevel != null && level > previousLevel + 1) {
      diagnostics.push({
        line: node.position.start.line,
        start_column: node.position.start.column,
        end_column: node.position.start.column + level,
        message: `Heading level jumps from ${previousLevel} to ${level}`,
        severity: 'warning',
      })
    }
    previousLevel = level
  })
  return diagnostics
}

const footnoteDiagnostics = (content: string, tree: MarkdownRoot): FsMarkdownDiagnostic[] => {
  const definitions = new Map<string, PositionedFootnote>()
  const references: PositionedFootnote[] = []
  const diagnostics: FsMarkdownDiagnostic[] = []

  visit(tree, (node) => {
    if (node.type === 'footnoteDefinition' && node.identifier && node.position) {
      const identifier = normalizeReferenceLabel(node.identifier)
      const first = definitions.get(identifier)
      if (first) {
        diagnostics.push(
          nodeDiagnostic(
            node,
            `Duplicate footnote definition "${node.identifier}" also appears on line ${first.node.position?.start.line}`,
          ),
        )
      } else {
        definitions.set(identifier, { identifier, node })
      }
      return
    }
    if (node.type === 'footnoteReference' && node.identifier && node.position) {
      references.push({ identifier: normalizeReferenceLabel(node.identifier), node })
      return
    }
    if (!isTextNode(node) || !node.position) return
    references.push(...unparsedFootnoteReferences(content, node))
  })

  for (const reference of references) {
    if (definitions.has(reference.identifier)) continue
    diagnostics.push(
      nodeDiagnostic(reference.node, `Cannot find footnote definition "${reference.identifier}"`),
    )
  }
  return diagnostics
}

const unparsedFootnoteReferences = (
  content: string,
  node: MarkdownNode & { value: string },
): PositionedFootnote[] => {
  const raw = rawNodeText(content, node)
  const start = node.position?.start
  if (!start) return []

  const references: PositionedFootnote[] = []
  for (const match of raw.matchAll(/\[\^([^\]\r\n]+)]/g)) {
    const matchIndex = match.index ?? 0
    if (isEscaped(raw, matchIndex)) continue
    const point = textOffsetPoint(start, raw, matchIndex)
    references.push({
      identifier: normalizeReferenceLabel(match[1] ?? ''),
      node: {
        type: 'footnoteReference',
        position: {
          start: point,
          end: textOffsetPoint(start, raw, matchIndex + (match[0]?.length ?? 1)),
        },
      },
    })
  }
  return references
}

const isEscaped = (value: string, index: number): boolean => {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) slashCount += 1
  return slashCount % 2 === 1
}

const frontmatterDiagnostics = (content: string, tree: MarkdownRoot): FsMarkdownDiagnostic[] => {
  const frontmatter = tree.children.find((node) => node.type === 'yaml')
  if (!frontmatter?.position) {
    return looksLikeUnclosedYamlFrontmatter(content)
      ? [
          {
            line: 1,
            start_column: 1,
            end_column: 4,
            message: 'YAML frontmatter is not closed',
            severity: 'error',
          },
        ]
      : []
  }

  const document = parseYamlDocument(frontmatter.value ?? '', {
    customTags: [],
    prettyErrors: false,
    schema: 'core',
    uniqueKeys: true,
  })
  return document.errors.map((error: YamlIssue) => {
    const offset = error.pos?.[0] ?? 0
    const point = textOffsetPoint(
      { line: frontmatter.position!.start.line + 1, column: 1 },
      frontmatter.value ?? '',
      offset,
    )
    return {
      line: point.line,
      start_column: point.column,
      end_column: point.column + 1,
      message: `Malformed YAML frontmatter: ${error.message}`,
      severity: 'error' as const,
    }
  })
}

const looksLikeUnclosedYamlFrontmatter = (content: string): boolean => {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return false
  if (lines.slice(1).some((line) => /^(---|\.\.\.)\s*$/.test(line))) return false
  return lines.slice(1).some((line) => /^\s*[\w"'-]+\s*:/.test(line))
}

const imageAltDiagnostics = (tree: MarkdownRoot): FsMarkdownDiagnostic[] => {
  const diagnostics: FsMarkdownDiagnostic[] = []
  visit(tree, (node) => {
    if ((!isImageNode(node) && !isImageReferenceNode(node)) || node.alt?.trim()) return
    diagnostics.push(nodeDiagnostic(node, 'Image is missing alternative text'))
  })
  return diagnostics
}

const nodeDiagnostic = (node: MarkdownNode, message: string): FsMarkdownDiagnostic => {
  const start = node.position?.start ?? { line: 1, column: 1 }
  const end = node.position?.end
  const endColumn = end?.line === start.line ? end.column : start.column + 1
  return {
    line: start.line,
    start_column: start.column,
    end_column: Math.max(start.column + 1, endColumn),
    message,
    severity: 'warning',
  }
}
