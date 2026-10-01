import { autocompletion, type CompletionSource } from '@codemirror/autocomplete'
import { language } from '@codemirror/language'
import { linter, type Diagnostic as CodeMirrorDiagnostic } from '@codemirror/lint'
import type { EditorState, Extension, Text } from '@codemirror/state'
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import {
  DiagnosticSeverity,
  type CompletionItem,
  type CompletionList,
  type Diagnostic,
  type Position,
} from 'vscode-languageserver-types'
import { mapEmbeddedCompletionItems } from '@/components/milkdown/embeddedLanguageCompletion'
import {
  createEmbeddedLanguageSession,
  type EmbeddedDocumentChange,
  type EmbeddedLanguageClient,
} from '@/components/milkdown/embeddedLanguageSession'

type EmbeddedLanguageCodeMirrorOptions = {
  client: EmbeddedLanguageClient
  supportedLanguages?: readonly string[]
  createDocumentUri?: (languageId: string, ordinal: number) => string
  lintDelay?: number
  onError?: (error: unknown) => void
}

type EmbeddedSession = ReturnType<typeof createEmbeddedLanguageSession>

type EmbeddedSessionPlugin = {
  readonly session: EmbeddedSession | null
  update: (update: ViewUpdate) => void
  destroy: () => void
}

const positionToOffset = (doc: Text, position: Position) => {
  const lineNumber = Math.min(Math.max(position.line + 1, 1), doc.lines)
  const line = doc.line(lineNumber)
  return Math.min(line.from + Math.max(position.character, 0), line.to)
}

const offsetToPosition = (doc: Text, offset: number): Position => {
  const safeOffset = Math.min(Math.max(offset, 0), doc.length)
  const line = doc.lineAt(safeOffset)
  return { line: line.number - 1, character: safeOffset - line.from }
}

const diagnosticSeverity = (severity?: DiagnosticSeverity): CodeMirrorDiagnostic['severity'] => {
  if (severity === DiagnosticSeverity.Error) return 'error'
  if (severity === DiagnosticSeverity.Warning) return 'warning'
  if (severity === DiagnosticSeverity.Hint) return 'hint'
  return 'info'
}

export { mapEmbeddedCompletionItems }

const diagnosticMessage = (diagnostic: Diagnostic) =>
  typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value

export const mapEmbeddedDiagnostics = (
  state: EditorState,
  diagnostics: Diagnostic[],
): CodeMirrorDiagnostic[] =>
  diagnostics.map((diagnostic) => ({
    from: positionToOffset(state.doc, diagnostic.range.start),
    to: positionToOffset(state.doc, diagnostic.range.end),
    severity: diagnosticSeverity(diagnostic.severity),
    source: diagnostic.source,
    message: diagnosticMessage(diagnostic),
  }))

const changesFromUpdate = (update: ViewUpdate): EmbeddedDocumentChange[] => {
  const changes: Array<{ from: number; to: number; change: EmbeddedDocumentChange }> = []
  update.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    changes.push({
      from,
      to,
      change: {
        range: {
          start: offsetToPosition(update.startState.doc, from),
          end: offsetToPosition(update.startState.doc, to),
        },
        text: inserted.toString(),
      },
    })
  })
  return changes
    .sort((left, right) => right.from - left.from || right.to - left.to)
    .map(({ change }) => change)
}

const normalizeCompletionItems = (
  result: CompletionItem[] | CompletionList | null,
): CompletionItem[] => (Array.isArray(result) ? result : (result?.items ?? []))

export const createEmbeddedLanguageCodeMirrorExtensions = ({
  client,
  supportedLanguages = ['mermaid'],
  createDocumentUri,
  lintDelay = 500,
  onError = console.error,
}: EmbeddedLanguageCodeMirrorOptions): Extension[] => {
  const supported = new Set(supportedLanguages.map((item) => item.trim().toLowerCase()))
  let documentOrdinal = 0
  const resolveLanguage = (state: EditorState) => {
    const languageId = state.facet(language)?.name?.trim().toLowerCase() ?? ''
    return supported.has(languageId) ? languageId : null
  }
  const sessionPlugin = ViewPlugin.define<EmbeddedSessionPlugin>((view) => {
    let currentLanguage: string | null = null
    let currentSession: EmbeddedSession | null = null
    const replaceSession = (state: EditorState, languageId: string | null) => {
      if (languageId === currentLanguage) return
      if (currentSession) void currentSession.close().catch(onError)
      currentLanguage = languageId
      currentSession = null
      if (!languageId) return
      const ordinal = ++documentOrdinal
      const uri =
        createDocumentUri?.(languageId, ordinal) ??
        `marklab-embedded://code-block/${ordinal}.${encodeURIComponent(languageId)}`
      currentSession = createEmbeddedLanguageSession({
        client,
        uri,
        languageId,
        text: state.doc.toString(),
        onError,
      })
    }
    replaceSession(view.state, resolveLanguage(view.state))
    return {
      get session() {
        return currentSession
      },
      update(update) {
        const nextLanguage = resolveLanguage(update.state)
        if (nextLanguage !== currentLanguage) {
          replaceSession(update.state, nextLanguage)
        } else if (currentSession && update.docChanged) {
          currentSession.change(changesFromUpdate(update))
        }
      },
      destroy() {
        if (currentSession) void currentSession.close().catch(onError)
      },
    }
  })

  const completionSource: CompletionSource = async (context) => {
    const session = context.view?.plugin(sessionPlugin)?.session
    if (!session) return null
    const word = context.matchBefore(/[\w-]*$/)
    if (!context.explicit && (!word || word.from === word.to)) return null
    try {
      const result = await session.completion(offsetToPosition(context.state.doc, context.pos))
      if (context.aborted) return null
      const items = normalizeCompletionItems(result)
      if (items.length === 0) return null
      return mapEmbeddedCompletionItems(context.state, items, word?.from ?? context.pos)
    } catch (error) {
      onError(error)
      return null
    }
  }

  return [
    sessionPlugin,
    autocompletion({ override: [completionSource] }),
    linter(
      async (view: EditorView) => {
        const session = view.plugin(sessionPlugin)?.session
        if (!session) return []
        try {
          return mapEmbeddedDiagnostics(view.state, await session.diagnostics())
        } catch (error) {
          onError(error)
          return []
        }
      },
      { delay: lintDelay },
    ),
  ]
}
