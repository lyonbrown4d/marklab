import { TextDocument } from 'vscode-languageserver-textdocument'
import type { Diagnostic } from 'vscode-languageserver-types'
import type { LanguageIntelligenceApi } from '@/types/languageIntelligence'

type SessionOptions = {
  api: LanguageIntelligenceApi
  onDiagnostics: (content: string, diagnostics: Diagnostic[]) => void
  onError: (error: unknown) => void
  path: string
  uri: string
}

export const createPlateMarkdownDiagnosticsSession = ({
  api,
  onDiagnostics,
  onError,
  path,
  uri,
}: SessionOptions) => {
  let document = TextDocument.create(uri, 'markdown', 0, '')
  let opened = false
  let disposed = false
  let generation = 0
  let queue = Promise.resolve()

  const synchronize = async (content: string) => {
    if (!opened) {
      document = TextDocument.create(uri, 'markdown', 1, content)
      await api.openDocument({ uri, languageId: 'markdown', path, version: 1, text: content })
      opened = true
      return
    }
    if (document.getText() === content) return

    const version = document.version + 1
    const change = {
      range: {
        start: { line: 0, character: 0 },
        end: document.positionAt(document.getText().length),
      },
      text: content,
    }
    document = TextDocument.update(document, [change], version)
    await api.changeDocument({ uri, version, changes: [change] })
  }

  const analyze = (content: string) => {
    const requestGeneration = ++generation
    const operation = queue.then(async () => {
      if (disposed) return
      await synchronize(content)
      const diagnostics = await api.diagnostics({ uri, version: document.version })
      if (!disposed && requestGeneration === generation) onDiagnostics(content, diagnostics)
    })
    queue = operation.catch((error) => {
      if (!disposed) onError(error)
    })
    return operation
  }

  const close = async () => {
    if (disposed) return
    disposed = true
    generation += 1
    await queue
    if (opened) await api.closeDocument({ uri })
    opened = false
  }

  return { analyze, close }
}
