import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import {
  registerMarkdownSourceDocumentSession,
  type MarkdownDocumentSessionClient,
} from '@/components/markdownSourceDocumentSession'

type ContentListener = (event: editor.IModelContentChangedEvent) => void
type ModelListener = () => void

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

const createModel = (uri: string, text: string, version = 1) =>
  ({
    uri: { toString: () => uri },
    getValue: () => text,
    getVersionId: () => version,
    isDisposed: () => false,
  }) as editor.ITextModel

describe('Markdown source document transitions', () => {
  let currentModel: editor.ITextModel | null
  let contentListener: ContentListener
  let modelListener: ModelListener
  let client: MarkdownDocumentSessionClient

  beforeEach(() => {
    currentModel = createModel('file:///workspace/draft.md', '# Draft')
    client = {
      openDocument: vi.fn().mockResolvedValue(undefined),
      changeDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
    }
    contentListener = vi.fn()
    modelListener = vi.fn()
  })

  const register = () =>
    registerMarkdownSourceDocumentSession({
      client,
      editor: {
        getModel: () => currentModel,
        onDidChangeModelContent: (listener: ContentListener) => {
          contentListener = listener
          return { dispose: vi.fn() }
        },
        onDidChangeModel: (listener: ModelListener) => {
          modelListener = listener
          return { dispose: vi.fn() }
        },
      } as unknown as editor.IStandaloneCodeEditor,
      getPath: () => 'draft.md',
    })

  it('closes the previous model and opens the replacement model', async () => {
    const session = register()
    await session.prepareCompletion(currentModel!)
    currentModel = createModel('file:///workspace/next.md', '# Next', 1)

    modelListener()
    await session.prepareCompletion(currentModel)

    expect(client.closeDocument).toHaveBeenCalledWith({ uri: 'file:///workspace/draft.md' })
    expect(client.openDocument).toHaveBeenLastCalledWith({
      uri: 'file:///workspace/next.md',
      languageId: 'markdown',
      path: 'draft.md',
      version: 1,
      text: '# Next',
    })
  })

  it('skips stale model transitions while a close request is pending', async () => {
    const closing = deferred<void>()
    vi.mocked(client.closeDocument).mockReturnValueOnce(closing.promise)
    const session = register()
    await session.prepareCompletion(currentModel!)

    currentModel = createModel('file:///workspace/intermediate.md', '# Intermediate', 1)
    modelListener()
    await vi.waitFor(() => expect(client.closeDocument).toHaveBeenCalledOnce())

    currentModel = createModel('file:///workspace/final.md', '# Final', 1)
    modelListener()
    closing.resolve()

    await expect(session.prepareCompletion(currentModel)).resolves.toEqual({
      uri: 'file:///workspace/final.md',
      version: 1,
    })
    expect(client.openDocument).not.toHaveBeenCalledWith(
      expect.objectContaining({ uri: 'file:///workspace/intermediate.md' }),
    )
    expect(client.openDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ uri: 'file:///workspace/final.md' }),
    )
  })

  it('opens a model snapshot before applying edits made during a pending close', async () => {
    const closing = deferred<void>()
    vi.mocked(client.closeDocument).mockReturnValueOnce(closing.promise)
    const session = register()
    await session.prepareCompletion(currentModel!)

    let text = '# Next'
    let version = 1
    const nextModel = {
      uri: { toString: () => 'file:///workspace/next.md' },
      getValue: () => text,
      getVersionId: () => version,
      isDisposed: () => false,
    } as editor.ITextModel
    currentModel = nextModel
    modelListener()
    await vi.waitFor(() => expect(client.closeDocument).toHaveBeenCalledOnce())

    text = '# Next!'
    version = 2
    contentListener({
      changes: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 7,
            endLineNumber: 1,
            endColumn: 7,
          },
          rangeLength: 0,
          rangeOffset: 6,
          text: '!',
        },
      ],
    } as editor.IModelContentChangedEvent)
    closing.resolve()

    await expect(session.prepareCompletion(nextModel)).resolves.toEqual({
      uri: 'file:///workspace/next.md',
      version: 2,
    })
    expect(client.openDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '# Next', version: 1 }),
    )
    expect(client.changeDocument).toHaveBeenLastCalledWith(expect.objectContaining({ version: 2 }))
  })
})
