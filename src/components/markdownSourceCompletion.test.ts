import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CancellationToken, Position, editor, languages } from 'monaco-editor'
import {
  CompletionItemKind,
  type CompletionItem,
  type CompletionList,
} from 'vscode-languageserver-types'
import {
  registerMarkdownCompletionProvider,
  type MarkdownSourceCompletionContext,
} from '@/components/markdownSourceCompletion'
import type { MarkdownSourceDocumentSession } from '@/components/markdownSourceDocumentSession'
import { getMarkdownCompletions } from '@/logic/markdownCompletions'
import { languageIntelligenceApi } from '@/services/languageIntelligenceApi'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/languageIntelligenceApi', () => ({
  languageIntelligenceApi: { completion: vi.fn() },
}))
vi.mock('@/logic/markdownCompletions', () => ({ getMarkdownCompletions: vi.fn(() => []) }))
const fileCompletion: CompletionItem = {
  label: 'Target',
  kind: CompletionItemKind.File,
  filterText: '/url',
  insertText: '../notes/target.md',
  detail: 'notes/target.md',
  sortText: '0001',
  textEdit: {
    newText: '../notes/target.md',
    range: {
      start: { line: 0, character: 9 },
      end: { line: 0, character: 9 },
    },
  },
}
const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}
const createCancellation = () => {
  let cancelled = false
  const listeners = new Set<() => void>()
  const token: CancellationToken = {
    get isCancellationRequested() {
      return cancelled
    },
    onCancellationRequested: (listener) => {
      const notify = () => listener(undefined)
      listeners.add(notify)
      return {
        dispose: () => {
          listeners.delete(notify)
        },
      }
    },
  }
  return {
    token,
    cancel: () => {
      cancelled = true
      listeners.forEach((notify) => notify())
    },
    listenerCount: () => listeners.size,
  }
}
let provider: languages.CompletionItemProvider
let registration: { dispose: () => void }
let context: MarkdownSourceCompletionContext
let model: editor.ITextModel
let ownerModel: editor.ITextModel | null
let ownerEditor: editor.IStandaloneCodeEditor
let workspaceKey: string
let state: { content: string; version: number; disposed: boolean }
let documentSession: MarkdownSourceDocumentSession
const disposeProvider = vi.fn()
const request = (token = createCancellation().token, lineNumber = 1, column = 10) =>
  Promise.resolve(
    provider.provideCompletionItems(
      model,
      { lineNumber, column } as Position,
      { triggerKind: 0 },
      token,
    ),
  )

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(languageIntelligenceApi.completion)
    .mockReset()
    .mockResolvedValue({ isIncomplete: false, items: [fileCompletion] })
  vi.mocked(getMarkdownCompletions).mockReset().mockReturnValue([])
  context = { activePath: 'drafts/current.md', files: [], fileContents: {} }
  state = { content: '[Target](', version: 1, disposed: false }
  model = {
    uri: { toString: () => 'file:///workspace/drafts/current.md' },
    getValue: () => state.content,
    getVersionId: () => state.version,
    isDisposed: () => state.disposed,
  } as editor.ITextModel
  ownerModel = model
  ownerEditor = {
    getModel: () => ownerModel,
  } as editor.IStandaloneCodeEditor
  workspaceKey = 'external:C:/workspace'
  documentSession = {
    dispose: vi.fn(),
    prepareCompletion: vi.fn(async (nextModel: editor.ITextModel) => ({
      uri: nextModel.uri.toString(),
      version: nextModel.getVersionId(),
    })),
    whenSettled: vi.fn(async () => undefined),
  }
  const monaco = {
    languages: {
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
      CompletionItemKind: { File: 20, Reference: 21, Keyword: 17, Snippet: 27, Text: 18 },
      registerCompletionItemProvider: (
        _language: string,
        next: languages.CompletionItemProvider,
      ) => {
        provider = next
        return { dispose: disposeProvider }
      },
    },
    Range: class {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number
      constructor(startLine: number, startColumn: number, endLine: number, endColumn: number) {
        this.startLineNumber = startLine
        this.startColumn = startColumn
        this.endLineNumber = endLine
        this.endColumn = endColumn
      }
    },
  } as unknown as typeof import('monaco-editor')
  registration = registerMarkdownCompletionProvider(monaco, () => context, documentSession, {
    getWorkspaceKey: () => workspaceKey,
    ownerEditor,
  })
})
afterEach(() => {
  registration.dispose()
  vi.useRealTimers()
})
describe('Markdown source completion lifecycle', () => {
  it('maps workspace-relative link completions from the typed language API', async () => {
    const cancellation = createCancellation()
    const result = await request(cancellation.token)
    expect(languageIntelligenceApi.completion).toHaveBeenCalledExactlyOnceWith({
      uri: 'file:///workspace/drafts/current.md',
      version: 1,
      position: { line: 0, character: 9 },
    })
    expect(result?.suggestions).toEqual([
      expect.objectContaining({
        label: 'Target',
        insertText: '../notes/target.md',
        kind: 20,
        filterText: '/url',
        sortText: '0001',
        range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 },
      }),
    ])
    expect(provider.triggerCharacters).toEqual(['[', '(', '#', '/', '`'])
    expect(cancellation.listenerCount()).toBe(0)
  })

  it('asks Monaco to request again when the LSP result is incomplete', async () => {
    vi.mocked(languageIntelligenceApi.completion).mockResolvedValue({
      isIncomplete: true,
      items: [fileCompletion],
    })

    const result = await request()

    expect(result?.incomplete).toBe(true)
  })

  it('uses the synchronized document version for unsaved heading completion', async () => {
    state.content = '# Fresh heading\n[Jump](#'
    vi.mocked(languageIntelligenceApi.completion).mockResolvedValue({
      isIncomplete: false,
      items: [
        {
          label: 'Fresh heading',
          kind: 18,
          insertText: 'fresh-heading',
          textEdit: {
            newText: 'fresh-heading',
            range: {
              start: { line: 1, character: 8 },
              end: { line: 1, character: 8 },
            },
          },
        },
      ],
    })
    const result = await request(undefined, 2, 9)
    expect(languageIntelligenceApi.completion).toHaveBeenCalledWith({
      uri: 'file:///workspace/drafts/current.md',
      version: 1,
      position: { line: 1, character: 8 },
    })
    expect(result?.suggestions[0]).toMatchObject({
      insertText: 'fresh-heading',
      kind: 21,
      range: { startLineNumber: 2, startColumn: 9, endLineNumber: 2, endColumn: 9 },
    })
  })

  it('does not start IPC for a request already cancelled', async () => {
    const cancellation = createCancellation()
    cancellation.cancel()
    expect(await request(cancellation.token)).toEqual({ suggestions: [] })
    expect(languageIntelligenceApi.completion).not.toHaveBeenCalled()
  })

  it('settles cancellation without waiting for IPC and skips fallback on a late failure', async () => {
    vi.useFakeTimers()
    const pending = deferred<CompletionList>()
    vi.mocked(languageIntelligenceApi.completion).mockReturnValue(pending.promise)
    const cancellation = createCancellation()
    const settled = vi.fn()
    void request(cancellation.token).then(settled)
    await Promise.resolve()
    await Promise.resolve()
    cancellation.cancel()
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledExactlyOnceWith({ suggestions: [] })
    expect(cancellation.listenerCount()).toBe(0)
    pending.reject(new Error('late IPC failure'))
    await vi.advanceTimersByTimeAsync(0)
    expect(getMarkdownCompletions).not.toHaveBeenCalled()
    expect(settled).toHaveBeenCalledTimes(1)
  })

  it.each(['version', 'path', 'model disposal', 'provider disposal'])(
    'drops results after %s changes',
    async (change) => {
      const pending = deferred<CompletionList>()
      vi.mocked(languageIntelligenceApi.completion).mockReturnValue(pending.promise)
      const result = request()
      if (change === 'version') state.version += 1
      if (change === 'path') context = { ...context, activePath: 'other.md' }
      if (change === 'model disposal') state.disposed = true
      if (change === 'provider disposal') registration.dispose()
      pending.resolve({ isIncomplete: false, items: [fileCompletion] })
      expect(await result).toEqual({ suggestions: [] })
    },
  )

  it('allows a newer request while IPC is pending and discards the older response', async () => {
    const pending = deferred<CompletionList>()
    vi.mocked(languageIntelligenceApi.completion).mockReturnValueOnce(pending.promise)
    const previous = request()
    await Promise.resolve()
    await Promise.resolve()
    state.content = '[Target](n'
    state.version += 1
    const next = await request(undefined, 1, 11)
    expect(languageIntelligenceApi.completion).toHaveBeenCalledTimes(2)
    expect(next?.suggestions[0].insertText).toBe('../notes/target.md')
    pending.resolve({ isIncomplete: false, items: [fileCompletion] })
    expect(await previous).toEqual({ suggestions: [] })
  })

  it('keeps the existing fallback for a current request when IPC fails', async () => {
    vi.mocked(languageIntelligenceApi.completion).mockRejectedValue(new Error('unavailable'))
    vi.mocked(getMarkdownCompletions).mockReturnValue([
      {
        label: 'Target',
        kind: 'file',
        insertText: '../notes/target.md',
        detail: 'notes/target.md',
        replacementStartColumn: 10,
      },
    ])
    expect((await request())?.suggestions[0].insertText).toBe('../notes/target.md')
    expect(getMarkdownCompletions).toHaveBeenCalledWith({
      ...context,
      content: state.content,
      line: 1,
      column: 10,
    })
  })
})
