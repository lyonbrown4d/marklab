import type { editor as MonacoEditor, Position } from 'monaco-editor'

const MAX_PREFIX_LENGTH = 8_192
const MAX_SUFFIX_LENGTH = 4_096
const PRECEDING_LINE_LIMIT = 3
const FOLLOWING_LINE_LIMIT = 2
const HEADING_SCAN_LINE_LIMIT = 32

export type MarkdownSourceInlineCompletionContext = {
  cursorOffset: number
  heading: string | null
  prefix: string
  suffix: string
}

const findHeading = (model: MonacoEditor.ITextModel, lineNumber: number): string | null => {
  const firstLine = Math.max(1, lineNumber - HEADING_SCAN_LINE_LIMIT)
  for (let line = lineNumber - 1; line >= firstLine; line -= 1) {
    const match = model.getLineContent(line).match(/^\s{0,3}#{1,6}\s+(.+)$/)
    if (match?.[1]) return match[1].trim().slice(0, 512) || null
  }
  return null
}

export const buildMarkdownSourceInlineCompletionContext = (
  model: MonacoEditor.ITextModel,
  position: Position,
  includeNearby: boolean,
): MarkdownSourceInlineCompletionContext | null => {
  const lineCount = model.getLineCount()
  if (position.lineNumber < 1 || position.lineNumber > lineCount) return null
  const currentLine = model.getLineContent(position.lineNumber)
  const cursorIndex = Math.max(0, Math.min(currentLine.length, position.column - 1))
  const currentPrefix = currentLine.slice(0, cursorIndex)
  const currentSuffix = currentLine.slice(cursorIndex)

  if (!includeNearby) {
    return {
      cursorOffset: model.getOffsetAt(position),
      heading: null,
      prefix: currentPrefix.slice(-MAX_PREFIX_LENGTH),
      suffix: currentSuffix.slice(0, MAX_SUFFIX_LENGTH),
    }
  }

  const preceding: string[] = []
  const firstPrecedingLine = Math.max(1, position.lineNumber - PRECEDING_LINE_LIMIT)
  for (let line = firstPrecedingLine; line < position.lineNumber; line += 1) {
    preceding.push(model.getLineContent(line))
  }
  const following: string[] = []
  const lastFollowingLine = Math.min(lineCount, position.lineNumber + FOLLOWING_LINE_LIMIT)
  for (let line = position.lineNumber + 1; line <= lastFollowingLine; line += 1) {
    following.push(model.getLineContent(line))
  }

  return {
    cursorOffset: model.getOffsetAt(position),
    heading: findHeading(model, position.lineNumber),
    prefix: [...preceding, currentPrefix].join('\n').slice(-MAX_PREFIX_LENGTH),
    suffix: [currentSuffix, ...following].join('\n').slice(0, MAX_SUFFIX_LENGTH),
  }
}
