import { DiagnosticSeverity, Position, Range } from 'vscode-languageserver-types'

import type {
  MermaidTextDocument,
  MermaidValidationIssue,
  MermaidValidator,
} from '@electron/services/mermaidLanguage/types.js'

const diagramDeclarations = new Set([
  'architecture-beta',
  'block-beta',
  'c4component',
  'c4container',
  'c4context',
  'c4deployment',
  'classdiagram',
  'erdiagram',
  'flowchart',
  'gantt',
  'gitgraph',
  'graph',
  'journey',
  'kanban',
  'mindmap',
  'packet-beta',
  'pie',
  'quadrantchart',
  'radar-beta',
  'requirementdiagram',
  'sankey-beta',
  'sequencediagram',
  'statediagram',
  'statediagram-v2',
  'timeline',
  'treemap',
  'usecase-beta',
  'xychart-beta',
])

export const validateMermaidDeclaration: MermaidValidator = (document) => {
  const declaration = findDeclaration(document)
  if (!declaration) return []
  const token = declaration.token.toLowerCase()
  if (
    diagramDeclarations.has(token) ||
    [...diagramDeclarations].some((candidate) => candidate.startsWith(token))
  )
    return []
  return [unknownDiagramIssue(declaration)]
}

const findDeclaration = (
  document: MermaidTextDocument,
): { line: number; start: number; token: string } | null => {
  const lines = document.text.split('\n')
  let inFrontmatter = false
  for (let line = 0; line < lines.length; line += 1) {
    const value = lines[line] ?? ''
    const trimmed = value.trim()
    if (!trimmed) continue
    if (trimmed === '---') {
      inFrontmatter = !inFrontmatter
      continue
    }
    if (inFrontmatter || trimmed.startsWith('%%')) continue
    const start = value.length - value.trimStart().length
    const token = firstToken(value.slice(start))
    return token ? { line, start, token } : null
  }
  return null
}

const firstToken = (value: string): string => {
  let end = 0
  while (end < value.length && !isWhitespace(value.charCodeAt(end))) end += 1
  return value.slice(0, end)
}

const isWhitespace = (character: number): boolean =>
  character === 9 || character === 10 || character === 13 || character === 32

const unknownDiagramIssue = ({
  line,
  start,
  token,
}: {
  line: number
  start: number
  token: string
}): MermaidValidationIssue => ({
  code: 'unknown-diagram',
  message: `Unknown Mermaid diagram declaration: ${token}`,
  range: Range.create(Position.create(line, start), Position.create(line, start + token.length)),
  severity: DiagnosticSeverity.Hint,
})
