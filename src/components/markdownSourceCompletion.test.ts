import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CancellationToken, Position, editor, languages } from 'monaco-editor'
import {
  registerMarkdownCompletionProvider,
  type MarkdownSourceCompletionContext,
} from '@/components/markdownSourceCompletion'
import { getMarkdownCompletions } from '@/logic/markdownCompletions'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'

vi.mock('@/runtime/environment', () => ({ isDesktopRuntime: () => true }))
vi.mock('@/services/markdownLanguageApi', () => ({
  markdownLanguageApi: { getCompletions: vi.fn() },
}))
vi.mock('@/logic/markdownCompletions', () => ({ getMarkdownCompletions: vi.fn(() => []) }))

type Completion = Awaited<ReturnType<typeof markdownLanguageApi.getCompletions>>[number]
const fileCompletion: Completion = {
  label: 'Target',
  kind: 'file',
  insertText: '../notes/target.md',
  detail: 'notes/target.md',
  replacementStartColumn: 10,
  lspKind: 17,
  sortText: '0001',
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
let state: { content: string; version: number; disposed: boolean }
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
  vi.mocked(markdownLanguageApi.getCompletions).mockReset().mockResolvedValue([fileCompletion])
  vi.mocked(getMarkdownCompletions).mockReset().mockReturnValue([])
  context = { activePath: 'drafts/current.md', files: [], fileContents: {} }
  state = { content: '[Target](', version: 1, disposed: false }
  model = {
    getValue: () => state.content,
    getVersionId: () => state.version,
    isDisposed: () => state.disposed,
  } as editor.ITextModel
  const monaco = {
    languages: {
      CompletionItemKind: { File: 17, Reference: 18, Keyword: 14 },
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
  registration = registerMarkdownCompletionProvider(monaco, () => context)
})

afterEach(() => {
  registration.dispose()
  vi.useRealTimers()
})

describe('Markdown source completion lifecycle', () => {
  it('maps workspace-relative link completions from the typed language API', async () => {
    const cancellation = createCancellation()
    const result = await request(cancellation.token)
    expect(markdownLanguageApi.getCompletions).toHaveBeenCalledExactlyOnceWith({
      path: 'drafts/current.md',
      content: '[Target](',
      line: 1,
      column: 10,
    })
    expect(result?.suggestions).toEqual([
      expect.objectContaining({
        label: 'Target',
        insertText: '../notes/target.md',
        kind: 17,
        sortText: '0001',
        range: { startLineNumber: 1, startColumn: 10, endLineNumber: 1, endColumn: 10 },
      }),
    ])
    expect(provider.triggerCharacters).toEqual(['[', '(', '#', '/', '`'])
    expect(cancellation.listenerCount()).toBe(0)
  })

  it('passes unsaved document content for heading completion and preserves its replacement range', async () => {
    state.content = '# Fresh heading\n[Jump](#'
    vi.mocked(markdownLanguageApi.getCompletions).mockResolvedValue([
      {
        label: 'Fresh heading',
        kind: 'heading',
        insertText: 'fresh-heading',
        lspKind: 18,
        replacementStartColumn: 9,
      },
    ])
    const result = await request(undefined, 2, 9)
    expect(markdownLanguageApi.getCompletions).toHaveBeenCalledWith({
      path: context.activePath,
      content: state.content,
      line: 2,
      column: 9,
    })
    expect(result?.suggestions[0]).toMatchObject({
      insertText: 'fresh-heading',
      kind: 18,
      range: { startLineNumber: 2, startColumn: 9, endLineNumber: 2, endColumn: 9 },
    })
  })

  it('does not start IPC for a request already cancelled', async () => {
    const cancellation = createCancellation()
    cancellation.cancel()
    expect(await request(cancellation.token)).toEqual({ suggestions: [] })
    expect(markdownLanguageApi.getCompletions).not.toHaveBeenCalled()
  })

  it('settles cancellation without waiting for IPC and skips fallback on a late failure', async () => {
    vi.useFakeTimers()
    const pending = deferred<Completion[]>()
    vi.mocked(markdownLanguageApi.getCompletions).mockReturnValue(pending.promise)
    const cancellation = createCancellation()
    const settled = vi.fn()
    void request(cancellation.token).then(settled)
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
      const pending = deferred<Completion[]>()
      vi.mocked(markdownLanguageApi.getCompletions).mockReturnValue(pending.promise)
      const result = request()
      if (change === 'version') state.version += 1
      if (change === 'path') context = { ...context, activePath: 'other.md' }
      if (change === 'model disposal') state.disposed = true
      if (change === 'provider disposal') registration.dispose()
      pending.resolve([fileCompletion])
      expect(await result).toEqual({ suggestions: [] })
    },
  )

  it('allows a newer request while IPC is pending and discards the older response', async () => {
    const pending = deferred<Completion[]>()
    vi.mocked(markdownLanguageApi.getCompletions).mockReturnValueOnce(pending.promise)
    const previous = request()
    state.content = '[Target](n'
    state.version += 1
    const next = await request(undefined, 1, 11)
    expect(markdownLanguageApi.getCompletions).toHaveBeenCalledTimes(2)
    expect(next?.suggestions[0].insertText).toBe('../notes/target.md')
    pending.resolve([fileCompletion])
    expect(await previous).toEqual({ suggestions: [] })
  })

  it('discards superseded requests even if content and path have not changed', async () => {
    const pending = deferred<Completion[]>()
    vi.mocked(markdownLanguageApi.getCompletions).mockReturnValueOnce(pending.promise)
    const previous = request()
    expect((await request())?.suggestions).toHaveLength(1)
    pending.resolve([fileCompletion])
    expect(await previous).toEqual({ suggestions: [] })
  })

  it.each(['model', 'provider'])('does not start IPC after %s disposal', async (target) => {
    if (target === 'model') state.disposed = true
    else registration.dispose()
    expect(await request()).toEqual({ suggestions: [] })
    expect(markdownLanguageApi.getCompletions).not.toHaveBeenCalled()
  })

  it('keeps the existing fallback for a current request when IPC fails', async () => {
    vi.mocked(markdownLanguageApi.getCompletions).mockRejectedValue(new Error('unavailable'))
    vi.mocked(getMarkdownCompletions).mockReturnValue([fileCompletion])
    expect((await request())?.suggestions[0].insertText).toBe('../notes/target.md')
    expect(getMarkdownCompletions).toHaveBeenCalledWith({
      ...context,
      content: state.content,
      line: 1,
      column: 10,
    })
  })

  it('does not compute fallback for a document that changed during IPC', async () => {
    const pending = deferred<Completion[]>()
    vi.mocked(markdownLanguageApi.getCompletions).mockReturnValue(pending.promise)
    const response = request()
    state.version += 1
    pending.reject(new Error('unavailable'))
    expect(await response).toEqual({ suggestions: [] })
    expect(getMarkdownCompletions).not.toHaveBeenCalled()
  })
})
