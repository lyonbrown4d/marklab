import {
  autocompletion,
  snippet,
  type Completion,
  type CompletionContext,
} from '@codemirror/autocomplete'
import { linter, type Diagnostic as CodeMirrorDiagnostic } from '@codemirror/lint'
import type { Text } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'
import { mermaid } from 'codemirror-lang-mermaid'
import {
  CompletionItemKind,
  DiagnosticSeverity,
  InsertTextFormat,
  type CompletionItem,
  type CompletionList,
  type Position,
  type Range,
} from 'vscode-languageserver-types'
import { embeddedLanguageClient } from '@/components/editor/language/embeddedLanguageClient'
import { createEmbeddedLanguageSession } from '@/components/editor/language/embeddedLanguageSession'

type IntelligenceOptions = {
  onError?: (error: unknown) => void
  uri: string
  value: string
}

const completionType: Partial<Record<CompletionItemKind, string>> = {
  [CompletionItemKind.Class]: 'class',
  [CompletionItemKind.Enum]: 'enum',
  [CompletionItemKind.Field]: 'property',
  [CompletionItemKind.File]: 'text',
  [CompletionItemKind.Function]: 'function',
  [CompletionItemKind.Interface]: 'interface',
  [CompletionItemKind.Keyword]: 'keyword',
  [CompletionItemKind.Method]: 'method',
  [CompletionItemKind.Module]: 'namespace',
  [CompletionItemKind.Property]: 'property',
  [CompletionItemKind.Reference]: 'text',
  [CompletionItemKind.Snippet]: 'text',
  [CompletionItemKind.Text]: 'text',
  [CompletionItemKind.Value]: 'constant',
  [CompletionItemKind.Variable]: 'variable',
}

const normalizeItems = (result: CompletionItem[] | CompletionList | null) =>
  Array.isArray(result) ? result : (result?.items ?? [])

const toPosition = (doc: Text, offset: number): Position => {
  const line = doc.lineAt(offset)
  return { character: offset - line.from, line: line.number - 1 }
}

const toOffset = (doc: Text, position: Position) => {
  const line = doc.line(Math.min(Math.max(position.line + 1, 1), doc.lines))
  return Math.min(line.to, line.from + Math.max(position.character, 0))
}

const editRange = (item: CompletionItem): Range | null => {
  if (!item.textEdit) return null
  return 'range' in item.textEdit ? item.textEdit.range : item.textEdit.replace
}

const documentationText = (item: CompletionItem) => {
  if (typeof item.documentation === 'string') return item.documentation
  return item.documentation?.value
}

const toCompletion = (item: CompletionItem): Completion => {
  const insertText = item.textEdit?.newText ?? item.insertText ?? item.label
  const range = editRange(item)
  const applySnippet =
    item.insertTextFormat === InsertTextFormat.Snippet ? snippet(insertText) : null
  return {
    apply:
      range || applySnippet
        ? (view, completion, from, to) => {
            const replaceFrom = range ? toOffset(view.state.doc, range.start) : from
            const replaceTo = range ? toOffset(view.state.doc, range.end) : to
            if (applySnippet) {
              applySnippet(view, completion, replaceFrom, replaceTo)
              return
            }
            view.dispatch({
              changes: { from: replaceFrom, insert: insertText, to: replaceTo },
              selection: { anchor: replaceFrom + insertText.length },
            })
          }
        : insertText,
    detail: item.detail,
    info: documentationText(item),
    label: item.label,
    sortText: item.sortText,
    type: item.kind ? completionType[item.kind] : 'keyword',
  }
}

const lspChanges = (update: ViewUpdate) => {
  const changes: Parameters<ReturnType<typeof createEmbeddedLanguageSession>['change']>[0] = []
  update.changes.iterChanges((from, to, _fromAfter, _toAfter, inserted) => {
    changes.push({
      range: {
        end: toPosition(update.startState.doc, to),
        start: toPosition(update.startState.doc, from),
      },
      rangeLength: to - from,
      text: inserted.toString(),
    })
  })
  return changes.reverse()
}

const diagnosticSeverity = (severity?: DiagnosticSeverity): CodeMirrorDiagnostic['severity'] => {
  if (severity === DiagnosticSeverity.Error) return 'error'
  if (severity === DiagnosticSeverity.Information) return 'info'
  if (severity === DiagnosticSeverity.Hint) return 'hint'
  return 'warning'
}

export const createMermaidCodeMirrorIntelligence = ({
  onError = console.error,
  uri,
  value,
}: IntelligenceOptions) => {
  const session = createEmbeddedLanguageSession({
    client: embeddedLanguageClient,
    languageId: 'mermaid',
    onError,
    text: value,
    uri,
  })
  const complete = async (context: CompletionContext) => {
    const word = context.matchBefore(/[\w-]*/)
    if (!context.explicit && !word?.text) return null
    const result = await session.completion(toPosition(context.state.doc, context.pos))
    if (context.aborted) return null
    const options = normalizeItems(result).map(toCompletion)
    return options.length > 0 ? { from: word?.from ?? context.pos, options } : null
  }
  const lint = linter(
    async (view) => {
      try {
        const diagnostics = await session.diagnostics()
        return diagnostics.map((item) => ({
          from: toOffset(view.state.doc, item.range.start),
          message: typeof item.message === 'string' ? item.message : item.message.value,
          severity: diagnosticSeverity(item.severity),
          source: item.source ?? 'Mermaid',
          to: toOffset(view.state.doc, item.range.end),
        }))
      } catch (error) {
        onError(error)
        return []
      }
    },
    { delay: 180 },
  )

  return {
    dispose: () => void session.close().catch(onError),
    extensions: [
      mermaid(),
      autocompletion({
        activateOnTyping: true,
        closeOnBlur: false,
        override: [complete],
      }),
      lint,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) session.change(lspChanges(update))
      }),
    ],
  }
}
