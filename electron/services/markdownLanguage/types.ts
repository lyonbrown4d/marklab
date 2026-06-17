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

export type RenameRequest = CompletionRequest & {
  newName: string
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

export type MarkdownLanguageTextEdit = {
  path: string
  line: number
  startColumn: number
  endColumn: number
  newText: string
}

export type MarkdownLanguageRenameResult = {
  edits: MarkdownLanguageTextEdit[]
  appliedEdits: number
  touchedFiles: string[]
  rejectReason?: string | null
}

export type MarkdownLanguageCodeAction =
  | {
      title: string
      kind: 'create-file'
      path: string
      isPreferred?: boolean
    }
  | {
      title: string
      kind: 'replace-text'
      edit: MarkdownLanguageTextEdit
      isPreferred?: boolean
    }

export type MarkdownLanguageHover = {
  path: string
  line: number
  heading?: string | null
  markdown: string
}
