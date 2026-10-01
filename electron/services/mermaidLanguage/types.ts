import type { DiagnosticSeverity, Position, Range } from 'vscode-languageserver-types'

export type MermaidDiagramKind =
  'flowchart' | 'sequence' | 'class' | 'state' | 'er' | 'gantt' | 'mindmap' | 'timeline'

export type MermaidTextDocument = {
  uri: string
  languageId: 'mermaid' | string
  version: number
  text: string
}

export type MermaidValidationIssue = {
  message: string
  range?: Range
  severity?: DiagnosticSeverity
  code?: string | number
}

export type MermaidValidationOptions = {
  signal?: AbortSignal
}

export type MermaidValidator = (
  document: MermaidTextDocument,
  options: MermaidValidationOptions,
) => readonly MermaidValidationIssue[] | void | Promise<readonly MermaidValidationIssue[] | void>

export type MermaidLanguageProviderOptions = {
  validator?: MermaidValidator
  maxDocumentLength?: number
}

export type MermaidCompletionContext = {
  diagram: MermaidDiagramKind | null
  insideBody: boolean
  position: Position
  replacementRange: Range
}
