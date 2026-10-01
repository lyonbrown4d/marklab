import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import {
  registerMarkdownSourceDocumentSession,
  type MarkdownDocumentSessionClient,
} from '@/components/markdownSourceDocumentSession'

type ContentListener = (event: editor.IModelContentChangedEvent) => void

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

describe('Markdown source document session', () => {
  let currentModel: editor.ITextModel | null
  let contentListener: ContentListener
  let client: MarkdownDocumentSessionClient

  beforeEach(() => {
    currentModel = createModel('file:///workspace/draft.md', '# Draft')
    client = {
      openDocument: vi.fn().mockResolvedValue(undefined),
      changeDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
    }
    contentListener = vi.fn()
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
        onDidChangeModel: () => ({ dispose: vi.fn() }),
      } as unknown as editor.IStandaloneCodeEditor,
      getPath: () => 'draft.md',
    })

  it('opens the current document once and exposes a lightweight completion context', async () => {
    const session = register()

    await expect(session.prepareCompletion(currentModel!)).resolves.toEqual({
      uri: 'file:///workspace/draft.md',
      version: 1,
    })
    expect(client.openDocument).toHaveBeenCalledExactlyOnceWith({
      uri: 'file:///workspace/draft.md',
      languageId: 'markdown',
      path: 'draft.md',
      version: 1,
      text: '# Draft',
    })
    expect(client.changeDocument).not.toHaveBeenCalled()

    await session.prepareCompletion(currentModel!)
    expect(client.openDocument).toHaveBeenCalledTimes(1)
  })

  it('sends Monaco changes incrementally without copying the full document', async () => {
    const session = register()
    await session.prepareCompletion(currentModel!)
    currentModel = createModel('file:///workspace/draft.md', '# Draft!', 2)

    contentListener({
      changes: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 8,
            endLineNumber: 1,
            endColumn: 8,
          },
          rangeLength: 0,
          rangeOffset: 7,
          text: '!',
        },
      ],
    } as editor.IModelContentChangedEvent)

    await session.prepareCompletion(currentModel)
    expect(client.changeDocument).toHaveBeenCalledExactlyOnceWith({
      uri: 'file:///workspace/draft.md',
      version: 2,
      changes: [
        {
          range: {
            start: { line: 0, character: 7 },
            end: { line: 0, character: 7 },
          },
          text: '!',
        },
      ],
    })
    expect(client.changeDocument).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.any(String) }),
    )
  })

  it('waits for an in-flight open before sending changes', async () => {
    const opening = deferred<void>()
    vi.mocked(client.openDocument).mockReturnValue(opening.promise)
    const session = register()
    currentModel = createModel('file:///workspace/draft.md', '# Draft!', 2)

    contentListener({
      changes: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 8,
            endLineNumber: 1,
            endColumn: 8,
          },
          rangeLength: 0,
          rangeOffset: 7,
          text: '!',
        },
      ],
    } as editor.IModelContentChangedEvent)
    await Promise.resolve()
    expect(client.changeDocument).not.toHaveBeenCalled()

    opening.resolve()
    await session.prepareCompletion(currentModel)
    expect(client.changeDocument).toHaveBeenCalledTimes(1)
  })

  it('preserves each version when multiple changes arrive before IPC settles', async () => {
    const changing = deferred<void>()
    vi.mocked(client.changeDocument).mockReturnValueOnce(changing.promise)
    const session = register()
    await session.prepareCompletion(currentModel!)

    currentModel = createModel('file:///workspace/draft.md', '# Draft!', 2)
    contentListener({
      changes: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 8,
            endLineNumber: 1,
            endColumn: 8,
          },
          rangeLength: 0,
          rangeOffset: 7,
          text: '!',
        },
      ],
    } as editor.IModelContentChangedEvent)
    currentModel = createModel('file:///workspace/draft.md', '# Draft!!', 3)
    contentListener({
      changes: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 9,
            endLineNumber: 1,
            endColumn: 9,
          },
          rangeLength: 0,
          rangeOffset: 8,
          text: '!',
        },
      ],
    } as editor.IModelContentChangedEvent)

    await Promise.resolve()
    expect(client.changeDocument).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ version: 2 }),
    )
    changing.resolve()
    await session.prepareCompletion(currentModel)
    expect(client.changeDocument).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ version: 3 }),
    )
  })

  it('does not copy the full model on the healthy edit and completion path', async () => {
    let version = 1
    const getValue = vi.fn(() => '# Draft')
    currentModel = {
      uri: { toString: () => 'file:///workspace/draft.md' },
      getValue,
      getVersionId: () => version,
      isDisposed: () => false,
    } as unknown as editor.ITextModel
    const session = register()
    await session.prepareCompletion(currentModel)
    getValue.mockClear()

    version = 2
    contentListener({
      changes: [
        {
          range: {
            startLineNumber: 1,
            startColumn: 8,
            endLineNumber: 1,
            endColumn: 8,
          },
          rangeLength: 0,
          rangeOffset: 7,
          text: '!',
        },
      ],
    } as editor.IModelContentChangedEvent)
    await session.prepareCompletion(currentModel)

    expect(getValue).not.toHaveBeenCalled()
  })

  it('closes the active document when disposed', async () => {
    const session = register()
    await session.prepareCompletion(currentModel!)

    session.dispose()
    await session.whenSettled()

    expect(client.closeDocument).toHaveBeenCalledExactlyOnceWith({
      uri: 'file:///workspace/draft.md',
    })
  })
})
