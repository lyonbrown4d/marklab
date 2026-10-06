import { Position, Range } from 'vscode-languageserver-types'

import type {
  MermaidCompletionContext,
  MermaidDiagramKind,
} from '@electron/services/mermaidLanguage/types'

const declarations = new Map<string, MermaidDiagramKind>([
  ['flowchart', 'flowchart'],
  ['graph', 'flowchart'],
  ['sequencediagram', 'sequence'],
  ['classdiagram', 'class'],
  ['statediagram', 'state'],
  ['statediagram-v2', 'state'],
  ['erdiagram', 'er'],
  ['gantt', 'gantt'],
  ['mindmap', 'mindmap'],
  ['timeline', 'timeline'],
])

const recognizedDeclarations = new Set([
  ...declarations.keys(),
  'architecture-beta',
  'block-beta',
  'c4component',
  'c4container',
  'c4context',
  'c4deployment',
  'gitgraph',
  'journey',
  'kanban',
  'packet-beta',
  'pie',
  'quadrantchart',
  'radar-beta',
  'requirementdiagram',
  'sankey-beta',
  'treemap',
  'usecase-beta',
  'xychart-beta',
  'zenuml',
])

export const mermaidCompletionContext = (
  text: string,
  position: Position,
): MermaidCompletionContext | null => {
  const lines = text.split('\n')
  if (!validPosition(lines, position)) return null

  const declaration = detectDeclaration(lines, position.line)
  return {
    declarationRecognized: declaration.recognized,
    diagram: declaration.diagram,
    insideBody:
      declaration.diagram === 'class' || declaration.diagram === 'er'
        ? hasUnclosedBrace(lines, position)
        : false,
    position,
    replacementRange: replacementRange(lines[position.line] ?? '', position),
  }
}

const detectDeclaration = (lines: readonly string[], cursorLine: number) => {
  for (let line = 0; line <= cursorLine; line += 1) {
    const value = (lines[line] ?? '').trimStart()
    if (!value || value.startsWith('%%')) continue
    const token = firstToken(value).toLowerCase()
    return {
      diagram: declarations.get(token) ?? null,
      recognized: recognizedDeclarations.has(token),
    }
  }
  return { diagram: null, recognized: false }
}

const firstToken = (value: string): string => {
  let end = 0
  while (end < value.length && isDeclarationCharacter(value.charCodeAt(end))) end += 1
  return value.slice(0, end)
}

const isDeclarationCharacter = (character: number): boolean =>
  (character >= 65 && character <= 90) ||
  (character >= 97 && character <= 122) ||
  (character >= 48 && character <= 57) ||
  character === 45

const hasUnclosedBrace = (lines: readonly string[], position: Position): boolean => {
  let depth = 0
  for (let lineIndex = 0; lineIndex <= position.line; lineIndex += 1) {
    const line = lines[lineIndex] ?? ''
    const limit = lineIndex === position.line ? position.character : line.length
    for (let character = 0; character < limit; character += 1) {
      if (line.charCodeAt(character) === 123) depth += 1
      if (line.charCodeAt(character) === 125) depth = Math.max(0, depth - 1)
    }
  }
  return depth > 0
}

const replacementRange = (line: string, position: Position): Range => {
  let start = position.character
  while (start > 0 && isWordCharacter(line.charCodeAt(start - 1))) start -= 1
  let end = position.character
  while (end < line.length && isWordCharacter(line.charCodeAt(end))) end += 1
  return Range.create(Position.create(position.line, start), Position.create(position.line, end))
}

const isWordCharacter = (character: number): boolean =>
  isDeclarationCharacter(character) || character === 95

const validPosition = (lines: readonly string[], position: Position): boolean => {
  if (!Number.isInteger(position.line) || !Number.isInteger(position.character)) return false
  if (position.line < 0 || position.line >= lines.length || position.character < 0) return false
  return position.character <= (lines[position.line]?.length ?? 0)
}
