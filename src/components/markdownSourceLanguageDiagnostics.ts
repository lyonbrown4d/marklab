import type { editor as MonacoEditor } from 'monaco-editor'
import { DiagnosticSeverity, type Diagnostic } from 'vscode-languageserver-types'
import type { MarkdownSourceDocumentSession } from '@/components/markdownSourceDocumentSession'

const DIAGNOSTIC_OWNER = 'marklab-language-intelligence'
const DIAGNOSTIC_DELAY_MS = 120

type MonacoModule = typeof import('monaco-editor')

export const registerMarkdownSourceLanguageDiagnostics = ({
  client,
  documentSession,
  editor,
  monaco,
  onError = console.error,
}: {
  client: { diagnostics: (request: { uri: string; version: number }) => Promise<Diagnostic[]> }
  documentSession: MarkdownSourceDocumentSession
  editor: MonacoEditor.IStandaloneCodeEditor
  monaco: MonacoModule
  onError?: (error: unknown) => void
}) => {
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let requestId = 0

  const clear = (model: MonacoEditor.ITextModel | null) => {
    if (model && !model.isDisposed()) monaco.editor.setModelMarkers(model, DIAGNOSTIC_OWNER, [])
  }

  const run = async (model: MonacoEditor.ITextModel, currentRequest: number) => {
    try {
      const document = await documentSession.prepareCompletion(model)
      if (!document || disposed || currentRequest !== requestId || model.isDisposed()) return
      const diagnostics = await client.diagnostics(document)
      if (
        disposed ||
        currentRequest !== requestId ||
        model.isDisposed() ||
        model.getVersionId() !== document.version
      )
        return
      monaco.editor.setModelMarkers(
        model,
        DIAGNOSTIC_OWNER,
        diagnostics.map((diagnostic) => toMarker(monaco, diagnostic)),
      )
    } catch (error) {
      if (!disposed && currentRequest === requestId) onError(error)
    }
  }

  const schedule = () => {
    if (disposed) return
    if (timer) clearTimeout(timer)
    const model = editor.getModel()
    requestId += 1
    const currentRequest = requestId
    if (!model) return
    timer = setTimeout(() => {
      timer = null
      void run(model, currentRequest)
    }, DIAGNOSTIC_DELAY_MS)
  }

  const contentDisposable = editor.onDidChangeModelContent(schedule)
  const modelDisposable = editor.onDidChangeModel?.(schedule) ?? { dispose: () => undefined }
  schedule()

  return {
    dispose: () => {
      if (disposed) return
      disposed = true
      requestId += 1
      if (timer) clearTimeout(timer)
      contentDisposable.dispose()
      modelDisposable.dispose()
      clear(editor.getModel())
    },
  }
}

const toMarker = (monaco: MonacoModule, diagnostic: Diagnostic): MonacoEditor.IMarkerData => ({
  code:
    typeof diagnostic.code === 'string' || typeof diagnostic.code === 'number'
      ? String(diagnostic.code)
      : undefined,
  endColumn: diagnostic.range.end.character + 1,
  endLineNumber: diagnostic.range.end.line + 1,
  message: typeof diagnostic.message === 'string' ? diagnostic.message : diagnostic.message.value,
  severity: toMarkerSeverity(monaco, diagnostic.severity),
  source: diagnostic.source,
  startColumn: diagnostic.range.start.character + 1,
  startLineNumber: diagnostic.range.start.line + 1,
})

const toMarkerSeverity = (monaco: MonacoModule, severity?: DiagnosticSeverity): number => {
  switch (severity) {
    case DiagnosticSeverity.Error:
      return monaco.MarkerSeverity.Error
    case DiagnosticSeverity.Warning:
      return monaco.MarkerSeverity.Warning
    case DiagnosticSeverity.Information:
      return monaco.MarkerSeverity.Info
    default:
      return monaco.MarkerSeverity.Hint
  }
}
