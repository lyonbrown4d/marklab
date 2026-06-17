import type { CompletionItemKind } from 'vscode-languageserver-types'

export type MarkdownLanguageCompletionKind = 'file' | 'heading' | 'language'

export type MarkdownLanguageCompletionItem = {
  label: string
  kind: MarkdownLanguageCompletionKind
  insertText: string
  detail?: string
  replacementStartColumn: number
  lspKind: CompletionItemKind
}

export type CompletionRequest = {
  path: string | null
  content: string
  line: number
  column: number
}

export type DiagnosticsRequest = {
  path: string
  content: string
}

export type MarkdownLanguageDefinition = {
  path: string
  line: number
  column: number
  endColumn?: number
  headingSlug?: string | null
}

export type MarkdownLanguageReference = {
  path: string
  line: number
  column: number
  endColumn: number
  text: string
  context: string
  targetAnchor?: string | null
  targetHeadingSlug?: string | null
}
