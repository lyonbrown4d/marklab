import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CancellationToken, editor, languages, Position } from 'monaco-editor'
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

const completion: CompletionItem = {
  label: 'Target',
  insertText: 'target.md',
  kind: CompletionItemKind.Keyword,
}

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, reject, resolve }
}

describe('Markdown source completion isolation', () => {
  let context: MarkdownSourceCompletionContext
  let disposed: boolean
  let model: editor.ITextModel
  let ownerModel: editor.ITextModel | null
  let provider: languages.CompletionItemProvider
  let registration: { dispose: () => void }
  let version: number
  let workspaceKey: string

  beforeEach(() => {
    vi.clearAllMocks()
    disposed = false
    version = 1
    workspaceKey = 'external:C:/workspace'
    context = { activePath: 'README.md', fileContents: {}, files: [] }
    model = {
      getValue: () => '# Readme',
      getVersionId: () => version,
      isDisposed: () => disposed,
      uri: { toString: () => 'marklab-source://model/workspace/README.md' },
    } as editor.ITextModel
    ownerModel = model
    const monaco = {
      languages: {
        CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
        CompletionItemKind: { Keyword: 17, Text: 18 },
        registerCompletionItemProvider: (
          _language: string,
          nextProvider: languages.CompletionItemProvider,
        ) => {
          provider = nextProvider
          return { dispose: vi.fn() }
        },
      },
      Range: class Range {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number

        constructor(
          startLineNumber: number,
          startColumn: number,
          endLineNumber: number,
          endColumn: number,
        ) {
          this.startLineNumber = startLineNumber
          this.startColumn = startColumn
          this.endLineNumber = endLineNumber
          this.endColumn = endColumn
        }
      },
    } as unknown as typeof import('monaco-editor')
    const documentSession = {
      dispose: vi.fn(),
      prepareCompletion: vi.fn(async () => ({ uri: model.uri.toString(), version })),
      whenSettled: vi.fn(async () => undefined),
    } as MarkdownSourceDocumentSession
    vi.mocked(languageIntelligenceApi.completion).mockResolvedValue({
      isIncomplete: false,
      items: [completion],
    })
    registration = registerMarkdownCompletionProvider(monaco, () => context, documentSession, {
      getWorkspaceKey: () => workspaceKey,
      ownerEditor: { getModel: () => ownerModel } as editor.IStandaloneCodeEditor,
    })
  })

  afterEach(() => registration.dispose())

  const request = () =>
    Promise.resolve(
      provider.provideCompletionItems(
        model,
        { column: 1, lineNumber: 1 } as Position,
        { triggerKind: 0 },
        { isCancellationRequested: false } as CancellationToken,
      ),
    )

  it('ignores requests from a model not owned by the registered editor', async () => {
    ownerModel = { ...model } as editor.ITextModel

    expect(await request()).toEqual({ suggestions: [] })
    expect(languageIntelligenceApi.completion).not.toHaveBeenCalled()
  })

  it('drops a late response after the owner editor switches models', async () => {
    const pending = deferred<CompletionList>()
    vi.mocked(languageIntelligenceApi.completion).mockReturnValue(pending.promise)
    const response = request()
    await Promise.resolve()
    ownerModel = { ...model } as editor.ITextModel
    pending.resolve({ isIncomplete: false, items: [completion] })

    expect(await response).toEqual({ suggestions: [] })
  })

  it('drops a late response after the provider moves to another workspace', async () => {
    const pending = deferred<CompletionList>()
    vi.mocked(languageIntelligenceApi.completion).mockReturnValue(pending.promise)
    const response = request()
    await Promise.resolve()
    workspaceKey = 'external:D:/other-workspace'
    pending.resolve({ isIncomplete: false, items: [completion] })

    expect(await response).toEqual({ suggestions: [] })
  })

  it('discards superseded requests with unchanged content and path', async () => {
    const pending = deferred<CompletionList>()
    vi.mocked(languageIntelligenceApi.completion).mockReturnValueOnce(pending.promise)
    const previous = request()
    await Promise.resolve()
    expect((await request())?.suggestions).toHaveLength(1)
    pending.resolve({ isIncomplete: false, items: [completion] })

    expect(await previous).toEqual({ suggestions: [] })
  })

  it.each(['model', 'provider'])('does not start IPC after %s disposal', async (target) => {
    if (target === 'model') disposed = true
    else registration.dispose()

    expect(await request()).toEqual({ suggestions: [] })
    expect(languageIntelligenceApi.completion).not.toHaveBeenCalled()
  })

  it('does not compute fallback for a document changed during IPC', async () => {
    const pending = deferred<CompletionList>()
    vi.mocked(languageIntelligenceApi.completion).mockReturnValue(pending.promise)
    const response = request()
    await Promise.resolve()
    version += 1
    pending.reject(new Error('unavailable'))

    expect(await response).toEqual({ suggestions: [] })
    expect(getMarkdownCompletions).not.toHaveBeenCalled()
  })
})
