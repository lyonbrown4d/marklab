import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { editor } from 'monaco-editor'
import {
  registerMarkdownSourceDocumentSession,
  type MarkdownDocumentSessionClient,
} from '@/components/markdownSourceDocumentSession'

type ContentListener = (event: editor.IModelContentChangedEvent) => void

const contentChange = (column: number, text: string) =>
  ({
    changes: [
      {
        range: {
          startLineNumber: 1,
          startColumn: column,
          endLineNumber: 1,
          endColumn: column,
        },
        rangeLength: 0,
        rangeOffset: column - 1,
        text,
      },
    ],
  }) as editor.IModelContentChangedEvent

describe('Markdown source document session recovery', () => {
  let text: string
  let version: number
  let contentListener: ContentListener
  let client: MarkdownDocumentSessionClient
  let model: editor.ITextModel
  let onError: (error: unknown) => void

  beforeEach(() => {
    text = '# Draft'
    version = 1
    model = {
      uri: { toString: () => 'file:///workspace/draft.md' },
      getValue: () => text,
      getVersionId: () => version,
      isDisposed: () => false,
    } as editor.ITextModel
    client = {
      openDocument: vi.fn().mockResolvedValue(undefined),
      changeDocument: vi.fn().mockResolvedValue(undefined),
      closeDocument: vi.fn().mockResolvedValue(undefined),
    }
    contentListener = vi.fn()
    onError = vi.fn()
  })

  const register = () =>
    registerMarkdownSourceDocumentSession({
      client,
      editor: {
        getModel: () => model,
        onDidChangeModelContent: (listener: ContentListener) => {
          contentListener = listener
          return { dispose: vi.fn() }
        },
        onDidChangeModel: () => ({ dispose: vi.fn() }),
      } as unknown as editor.IStandaloneCodeEditor,
      getPath: () => 'draft.md',
      onError,
    })

  it('reopens the current full snapshot after the initial open fails', async () => {
    vi.mocked(client.openDocument).mockRejectedValueOnce(new Error('open failed'))
    const session = register()

    await expect(session.prepareCompletion(model)).resolves.toEqual({
      uri: 'file:///workspace/draft.md',
      version: 1,
    })

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'open failed' }))
    expect(client.closeDocument).toHaveBeenCalledWith({ uri: 'file:///workspace/draft.md' })
    expect(client.openDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '# Draft', version: 1 }),
    )
    expect(client.openDocument).toHaveBeenCalledTimes(2)
  })

  it('resyncs the latest snapshot instead of applying another delta after change failure', async () => {
    const session = register()
    await session.prepareCompletion(model)
    vi.mocked(client.changeDocument).mockRejectedValueOnce(new Error('change failed'))

    text = '# Draft!'
    version = 2
    contentListener(contentChange(8, '!'))
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())

    text = '# Draft!!'
    version = 3
    contentListener(contentChange(9, '!'))
    await expect(session.prepareCompletion(model)).resolves.toEqual({
      uri: 'file:///workspace/draft.md',
      version: 3,
    })

    expect(client.closeDocument).toHaveBeenCalledWith({ uri: 'file:///workspace/draft.md' })
    expect(client.openDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '# Draft!!', version: 3 }),
    )
    expect(client.changeDocument).toHaveBeenCalledTimes(1)
  })
})
