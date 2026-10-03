import type {
  CompletionItem,
  CompletionList,
  Diagnostic,
  Position,
  Range,
} from 'vscode-languageserver-types'
import { TextDocument } from 'vscode-languageserver-textdocument'

export type EmbeddedDocumentChange = {
  range: Range
  rangeLength?: number
  text: string
}

export type EmbeddedDocumentIdentity = {
  uri: string
  languageId: string
  version: number
}

export type EmbeddedLanguageClient = {
  openDocument: (input: EmbeddedDocumentIdentity & { text: string }) => Promise<void> | void
  changeDocument: (input: {
    uri: string
    version: number
    changes: EmbeddedDocumentChange[]
  }) => Promise<void> | void
  closeDocument: (input: { uri: string }) => Promise<void> | void
  completion: (
    input: EmbeddedDocumentIdentity & { position: Position },
  ) => Promise<CompletionItem[] | CompletionList | null>
  diagnostics?: (input: EmbeddedDocumentIdentity) => Promise<Diagnostic[]>
}

type SessionOptions = {
  client: EmbeddedLanguageClient
  uri: string
  languageId: string
  text: string
  onError?: (error: unknown) => void
}

export const createEmbeddedLanguageSession = (options: SessionOptions) => {
  const onError = options.onError ?? console.error
  let document = TextDocument.create(options.uri, options.languageId, 1, options.text)
  let remoteVersion: number | null = null
  let remoteMayExist = false
  let closed = false
  let synchronization = Promise.resolve()

  const identity = (version: number): EmbeddedDocumentIdentity => ({
    uri: options.uri,
    languageId: options.languageId,
    version,
  })
  const enqueue = (operation: () => Promise<void> | void) => {
    const result = synchronization.then(operation)
    synchronization = result.catch(onError)
    return result
  }
  const openSnapshot = async (snapshot: EmbeddedDocumentIdentity & { text: string }) => {
    remoteMayExist = true
    remoteVersion = null
    await options.client.openDocument(snapshot)
    remoteVersion = snapshot.version
  }
  const resynchronize = async () => {
    if (remoteMayExist) await options.client.closeDocument({ uri: options.uri })
    remoteMayExist = false
    remoteVersion = null
    await openSnapshot({ ...identity(document.version), text: document.getText() })
  }
  const synchronizeVersion = async (version: number, changes?: EmbeddedDocumentChange[]) => {
    if (remoteVersion === version) return
    if (changes && remoteVersion === version - 1) {
      remoteVersion = null
      await options.client.changeDocument({ uri: options.uri, version, changes })
      remoteVersion = version
      return
    }
    await resynchronize()
  }

  const initialSnapshot = { ...identity(document.version), text: document.getText() }
  void enqueue(() => openSnapshot(initialSnapshot)).catch(() => undefined)

  const change = (changes: EmbeddedDocumentChange[]) => {
    if (closed || changes.length === 0) return
    document = TextDocument.update(document, changes, document.version + 1)
    const version = document.version
    void enqueue(() => synchronizeVersion(version, changes)).catch(() => undefined)
  }
  const completion = async (position: Position) => {
    const version = document.version
    await enqueue(() => synchronizeVersion(version))
    return options.client.completion({ ...identity(remoteVersion ?? version), position })
  }
  const diagnostics = async () => {
    const version = document.version
    await enqueue(() => synchronizeVersion(version))
    return options.client.diagnostics?.(identity(remoteVersion ?? version)) ?? []
  }
  const close = async () => {
    if (closed) return
    closed = true
    await synchronization
    if (!remoteMayExist) return
    await enqueue(async () => {
      await options.client.closeDocument({ uri: options.uri })
      remoteMayExist = false
      remoteVersion = null
    })
  }

  return { change, close, completion, diagnostics }
}
