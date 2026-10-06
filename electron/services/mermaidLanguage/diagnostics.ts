import { TextDocument } from 'vscode-languageserver-textdocument'
import { DiagnosticSeverity, Position, Range, type Diagnostic } from 'vscode-languageserver-types'

import type {
  MermaidTextDocument,
  MermaidValidationIssue,
  MermaidValidationOptions,
  MermaidValidator,
} from '@electron/services/mermaidLanguage/types'

const MAX_DIAGNOSTICS = 100
const MAX_MESSAGE_LENGTH = 500

export const mermaidDiagnostics = async (
  document: MermaidTextDocument,
  validator: MermaidValidator | undefined,
  options: MermaidValidationOptions,
): Promise<Diagnostic[]> => {
  throwIfAborted(options.signal)
  if (!validator) return []

  try {
    const issues = await validator(document, options)
    throwIfAborted(options.signal)
    if (!Array.isArray(issues)) return []
    return issues.slice(0, MAX_DIAGNOSTICS).map((issue) => issueDiagnostic(document, issue))
  } catch (error) {
    if (isAbortError(error)) throw error
    return [parserErrorDiagnostic(document, error)]
  }
}

export const documentTooLargeDiagnostic = (
  document: MermaidTextDocument,
  maxDocumentLength: number,
): Diagnostic => ({
  code: 'document-too-large',
  message: `Mermaid language features are disabled above ${maxDocumentLength} characters.`,
  range: firstCharacterRange(document),
  severity: DiagnosticSeverity.Information,
  source: 'mermaid',
})

const issueDiagnostic = (
  document: MermaidTextDocument,
  issue: MermaidValidationIssue,
): Diagnostic => ({
  ...(issue.code == null ? {} : { code: issue.code }),
  message: boundedMessage(issue.message),
  range: clampRange(document, issue.range ?? firstCharacterRange(document)),
  severity: issue.severity ?? DiagnosticSeverity.Error,
  source: 'mermaid',
})

const parserErrorDiagnostic = (document: MermaidTextDocument, error: unknown): Diagnostic => ({
  message: boundedMessage(errorMessage(error)),
  range: clampRange(document, errorRange(error) ?? firstCharacterRange(document)),
  severity: DiagnosticSeverity.Error,
  source: 'mermaid',
})

const errorRange = (error: unknown): Range | null => {
  const record = objectValue(error)
  const hash = objectValue(safeProperty(record, 'hash'))
  const location = objectValue(safeProperty(hash, 'loc'))
  const firstLine = finiteNumber(safeProperty(location, 'first_line'))
  const firstColumn = finiteNumber(safeProperty(location, 'first_column'))
  const lastLine = finiteNumber(safeProperty(location, 'last_line')) ?? firstLine
  const lastColumn = finiteNumber(safeProperty(location, 'last_column')) ?? firstColumn
  if (firstLine == null || firstColumn == null || lastLine == null || lastColumn == null)
    return null

  return Range.create(
    Position.create(Math.max(0, Math.floor(firstLine) - 1), Math.max(0, Math.floor(firstColumn))),
    Position.create(Math.max(0, Math.floor(lastLine) - 1), Math.max(0, Math.floor(lastColumn))),
  )
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message
  const message = safeProperty(objectValue(error), 'message')
  return typeof message === 'string' && message.trim()
    ? message
    : 'Mermaid syntax validation failed.'
}

const boundedMessage = (message: string): string =>
  (message.trim() || 'Mermaid syntax validation failed.').slice(0, MAX_MESSAGE_LENGTH)

const clampRange = (document: MermaidTextDocument, range: Range): Range => {
  const textDocument = TextDocument.create(
    document.uri,
    document.languageId,
    document.version,
    document.text,
  )
  const startOffset = textDocument.offsetAt(range.start)
  const endOffset = Math.max(startOffset, textDocument.offsetAt(range.end))
  return Range.create(textDocument.positionAt(startOffset), textDocument.positionAt(endOffset))
}

const firstCharacterRange = (document: MermaidTextDocument): Range => {
  const lineBreak = document.text.indexOf('\n')
  const firstLine = document.text.slice(0, lineBreak < 0 ? document.text.length : lineBreak)
  const firstLineLength = firstLine.endsWith('\r') ? firstLine.length - 1 : firstLine.length
  return Range.create(Position.create(0, 0), Position.create(0, firstLineLength > 0 ? 1 : 0))
}

const safeProperty = (value: Record<string, unknown> | null, key: string): unknown => {
  if (!value) return undefined
  try {
    return value[key]
  } catch {
    return undefined
  }
}

const objectValue = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const isAbortError = (error: unknown): boolean =>
  error instanceof Error
    ? error.name === 'AbortError'
    : safeProperty(objectValue(error), 'name') === 'AbortError'

const throwIfAborted = (signal?: AbortSignal): void => {
  if (!signal?.aborted) return
  const error = new Error('Mermaid validation was cancelled')
  error.name = 'AbortError'
  throw error
}
