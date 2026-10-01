import type { editor as MonacoEditor } from 'monaco-editor'

export type MarkdownDocumentPosition = {
  line: number
  character: number
}

export type MarkdownDocumentChange = {
  range: {
    start: MarkdownDocumentPosition
    end: MarkdownDocumentPosition
  }
  text: string
}

export type MarkdownDocumentSessionClient = {
  openDocument: (input: {
    uri: string
    languageId: 'markdown'
    path: string | null
    version: number
    text: string
  }) => Promise<unknown>
  changeDocument: (input: {
    uri: string
    version: number
    changes: MarkdownDocumentChange[]
  }) => Promise<unknown>
  closeDocument: (input: { uri: string }) => Promise<unknown>
}

type DocumentState = {
  model: MonacoEditor.ITextModel
  uri: string
  version: number
}

type DesiredDocument = DocumentState & {
  path: string | null
}

type DocumentSnapshot = DesiredDocument & {
  text: string
}

const toDocumentChange = (change: MonacoEditor.IModelContentChange): MarkdownDocumentChange => ({
  range: {
    start: {
      line: change.range.startLineNumber - 1,
      character: change.range.startColumn - 1,
    },
    end: {
      line: change.range.endLineNumber - 1,
      character: change.range.endColumn - 1,
    },
  },
  text: change.text,
})

export const registerMarkdownSourceDocumentSession = ({
  client,
  editor,
  getPath,
  onError = console.error,
}: {
  client: MarkdownDocumentSessionClient
  editor: MonacoEditor.IStandaloneCodeEditor
  getPath: () => string | null
  onError?: (error: unknown) => void
}) => {
  let current: DocumentState | null = null
  let desired: DesiredDocument | null = null
  let remoteUri: string | null = null
  let disposed = false
  let failure: unknown = null
  let queue = Promise.resolve()
  let transitionRevision = 0

  const targetDocument = (model: MonacoEditor.ITextModel): DesiredDocument => ({
    model,
    path: getPath(),
    uri: model.uri.toString(),
    version: model.getVersionId(),
  })

  const snapshot = (target: DesiredDocument): DocumentSnapshot => ({
    ...target,
    text: target.model.getValue(),
    version: target.model.getVersionId(),
  })

  const enqueue = (operation: () => Promise<void>): Promise<void> => {
    const result = queue.then(operation)
    queue = result.catch((error: unknown) => {
      failure = error
      onError(error)
    })
    return result
  }

  const closeRemote = async (): Promise<void> => {
    const uri = remoteUri
    if (!uri) return
    current = null
    await client.closeDocument({ uri })
    if (remoteUri === uri) remoteUri = null
  }

  const openSnapshot = async (target: DocumentSnapshot): Promise<void> => {
    remoteUri = target.uri
    current = null
    await client.openDocument({
      uri: target.uri,
      languageId: 'markdown',
      path: target.path,
      version: target.version,
      text: target.text,
    })
    current = { model: target.model, uri: target.uri, version: target.version }
    failure = null
  }

  const synchronizeDocument = async (target: DesiredDocument): Promise<void> => {
    if (current?.uri === target.uri && current.version === target.version) {
      current.model = target.model
      failure = null
      return
    }
    await closeRemote()
    if (disposed) return
    const latest = desired?.uri === target.uri ? desired : target
    await openSnapshot(snapshot(latest))
  }

  const reconcileModel = async (
    revision: number,
    target: DocumentSnapshot | null,
  ): Promise<void> => {
    if (revision !== transitionRevision) return
    const uri = disposed ? null : (target?.uri ?? null)
    if (current?.uri === uri && remoteUri === uri) {
      if (target) current.model = target.model
      failure = null
      return
    }
    await closeRemote()
    if (revision !== transitionRevision || !target || disposed) return
    await openSnapshot(target)
  }

  const transitionTo = (model: MonacoEditor.ITextModel | null): Promise<void> => {
    desired = model ? targetDocument(model) : null
    transitionRevision += 1
    const revision = transitionRevision
    const target = desired ? snapshot(desired) : null
    return enqueue(() => reconcileModel(revision, target))
  }

  const initialModel = editor.getModel()
  if (initialModel) void transitionTo(initialModel).catch(() => undefined)

  const contentDisposable = editor.onDidChangeModelContent((event) => {
    if (disposed) return
    const model = editor.getModel()
    if (!model) return
    const uri = model.uri.toString()
    const target = targetDocument(model)
    const needsTransition = desired?.uri !== uri
    desired = target
    if (needsTransition) {
      void transitionTo(model).catch(() => undefined)
    }
    const changes = event.changes.map(toDocumentChange)
    void enqueue(async () => {
      if (disposed || desired?.uri !== uri) return
      if (current?.uri === uri && current.version === target.version) {
        failure = null
        return
      }
      if (current?.uri !== uri || current.version !== target.version - 1) {
        await synchronizeDocument(target)
        return
      }
      current = null
      await client.changeDocument({ uri, version: target.version, changes })
      current = { model, uri, version: target.version }
      failure = null
    }).catch(() => undefined)
  })

  const modelDisposable = editor.onDidChangeModel
    ? editor.onDidChangeModel(() => {
        if (disposed) return
        void transitionTo(editor.getModel()).catch(() => undefined)
      })
    : { dispose: () => undefined }

  return {
    prepareCompletion: async (model: MonacoEditor.ITextModel) => {
      if (disposed || model.isDisposed()) return null
      const target = targetDocument(model)
      const synchronization =
        desired?.uri === target.uri
          ? (() => {
              desired = target
              return enqueue(() => synchronizeDocument(target))
            })()
          : transitionTo(model)
      await synchronization
      if (failure) throw failure
      const state = current
      if (!state || state.uri !== model.uri.toString()) return null
      return { uri: state.uri, version: state.version }
    },
    whenSettled: async () => {
      await queue
      if (failure) throw failure
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      contentDisposable.dispose()
      modelDisposable.dispose()
      desired = null
      transitionRevision += 1
      void enqueue(async () => {
        await closeRemote()
        failure = null
      }).catch(() => undefined)
    },
  }
}

export type MarkdownSourceDocumentSession = ReturnType<typeof registerMarkdownSourceDocumentSession>
