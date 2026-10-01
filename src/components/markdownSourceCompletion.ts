import type {
  CancellationToken,
  IDisposable,
  editor as MonacoEditor,
  IPosition,
  languages as MonacoLanguages,
} from 'monaco-editor'
import {
  CompletionItemKind as LspCompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type Range,
} from 'vscode-languageserver-types'
import type { MarkdownSourceDocumentSession } from '@/components/markdownSourceDocumentSession'
import { getMarkdownCompletions } from '@/logic/markdownCompletions'
import { isDesktopRuntime } from '@/runtime/environment'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'
import type { FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'

export type MarkdownSourceCompletionContext = {
  activePath: string | null
  files: FileEntry[]
  fileContents: Record<string, string>
  workspaceIndex?: FsWorkspaceIndex | null
}

type MonacoModule = typeof import('monaco-editor')
type CancellationLike = Pick<CancellationToken, 'isCancellationRequested'> &
  Partial<Pick<CancellationToken, 'onCancellationRequested'>>
type MarkdownCompletionItem = {
  label: string
  kind: 'file' | 'heading' | 'language' | number
  insertText: string
  detail?: string
  filterText?: string
  replacementStartColumn: number
  sortText?: string
  lspRange?: Range
  snippet?: boolean
}

export const registerMarkdownCompletionProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
  documentSession: MarkdownSourceDocumentSession,
) => {
  let disposed = false
  let latestRequest = 0
  const registration = monaco.languages.registerCompletionItemProvider('markdown', {
    triggerCharacters: ['[', '(', '#', '/', '`'],
    provideCompletionItems: async (
      model: MonacoEditor.ITextModel,
      position: IPosition,
      _context: MonacoLanguages.CompletionContext,
      token: CancellationLike = { isCancellationRequested: false },
    ) => {
      if (disposed || token.isCancellationRequested || model.isDisposed()) {
        return { suggestions: [] }
      }
      const context = getContext()
      const path = context.activePath
      const version = model.getVersionId()
      const request = ++latestRequest
      const isCurrent = () =>
        !disposed &&
        !token.isCancellationRequested &&
        request === latestRequest &&
        !model.isDisposed() &&
        model.getVersionId() === version &&
        getContext().activePath === path
      let cancellationSubscription: IDisposable | undefined
      const cancelled = new Promise<MarkdownCompletionItem[]>((resolve) => {
        cancellationSubscription = token.onCancellationRequested?.(() => resolve([]))
      })

      try {
        // IPC has no abort command; release Monaco immediately and ignore any late response.
        const completions = await Promise.race([
          getCompletionItems(model, position, context, documentSession, isCurrent),
          cancelled,
        ])
        if (!isCurrent()) return { suggestions: [] }
        const suggestions: MonacoLanguages.CompletionItem[] = completions.map((item) => {
          const range = item.lspRange
            ? new monaco.Range(
                item.lspRange.start.line + 1,
                item.lspRange.start.character + 1,
                item.lspRange.end.line + 1,
                item.lspRange.end.character + 1,
              )
            : new monaco.Range(
                position.lineNumber,
                item.replacementStartColumn,
                position.lineNumber,
                position.column,
              )
          return {
            label: item.label,
            kind:
              typeof item.kind === 'number'
                ? toMonacoCompletionKind(monaco, item.kind)
                : item.kind === 'file'
                  ? monaco.languages.CompletionItemKind.File
                  : item.kind === 'heading'
                    ? monaco.languages.CompletionItemKind.Reference
                    : monaco.languages.CompletionItemKind.Keyword,
            insertText: item.insertText,
            ...(item.snippet
              ? { insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet }
              : {}),
            detail: item.detail,
            filterText: item.filterText,
            sortText: item.sortText,
            range,
          }
        })
        return { suggestions }
      } finally {
        cancellationSubscription?.dispose()
      }
    },
  })
  return {
    dispose: () => {
      if (disposed) return
      disposed = true
      registration.dispose()
    },
  }
}

const toMonacoCompletionKind = (monaco: MonacoModule, kind: number) => {
  const target = monaco.languages.CompletionItemKind
  switch (kind) {
    case LspCompletionItemKind.Method:
      return target.Method
    case LspCompletionItemKind.Function:
      return target.Function
    case LspCompletionItemKind.Constructor:
      return target.Constructor
    case LspCompletionItemKind.Field:
      return target.Field
    case LspCompletionItemKind.Variable:
      return target.Variable
    case LspCompletionItemKind.Class:
      return target.Class
    case LspCompletionItemKind.Interface:
      return target.Interface
    case LspCompletionItemKind.Module:
      return target.Module
    case LspCompletionItemKind.Property:
      return target.Property
    case LspCompletionItemKind.Unit:
      return target.Unit
    case LspCompletionItemKind.Value:
      return target.Value
    case LspCompletionItemKind.Enum:
      return target.Enum
    case LspCompletionItemKind.Keyword:
      return target.Keyword
    case LspCompletionItemKind.Snippet:
      return target.Snippet
    case LspCompletionItemKind.Color:
      return target.Color
    case LspCompletionItemKind.File:
      return target.File
    case LspCompletionItemKind.Reference:
      return target.Reference
    case LspCompletionItemKind.Folder:
      return target.Folder
    case LspCompletionItemKind.EnumMember:
      return target.EnumMember
    case LspCompletionItemKind.Constant:
      return target.Constant
    case LspCompletionItemKind.Struct:
      return target.Struct
    case LspCompletionItemKind.Event:
      return target.Event
    case LspCompletionItemKind.Operator:
      return target.Operator
    case LspCompletionItemKind.TypeParameter:
      return target.TypeParameter
    default:
      return target.Text
  }
}

const getCompletionItems = async (
  model: MonacoEditor.ITextModel,
  position: IPosition,
  context: MarkdownSourceCompletionContext,
  documentSession: MarkdownSourceDocumentSession,
  isCurrent: () => boolean,
): Promise<MarkdownCompletionItem[]> => {
  if (!isCurrent()) return []

  if (isDesktopRuntime() && context.activePath) {
    try {
      const document = await documentSession.prepareCompletion(model)
      if (!document || !isCurrent()) return []
      const result = await languageIntelligenceApi.completion({
        ...document,
        position: {
          line: position.lineNumber - 1,
          character: position.column - 1,
        },
      })
      return result.items.map(fromLanguageCompletion)
    } catch {
      if (!isCurrent()) return []
    }
  }

  const content = model.getValue()
  return getMarkdownCompletions({
    ...context,
    content,
    line: position.lineNumber,
    column: position.column,
  })
}

const fromLanguageCompletion = (item: CompletionItem): MarkdownCompletionItem => {
  const textEdit = item.textEdit
  const editRange = textEdit ? ('range' in textEdit ? textEdit.range : textEdit.replace) : undefined
  const label = item.label
  return {
    label,
    kind: item.kind ?? 'language',
    insertText: textEdit?.newText ?? item.insertText ?? label,
    detail: item.detail,
    filterText: item.filterText,
    replacementStartColumn: (editRange?.start.character ?? 0) + 1,
    sortText: item.sortText,
    lspRange: editRange,
    snippet: item.insertTextFormat === InsertTextFormat.Snippet,
  }
}
