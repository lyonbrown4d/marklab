import { vi } from 'vitest'

export type SourceTextProvider = {
  provideCompletionItems: (...args: unknown[]) => Promise<{
    suggestions: { insertText?: string; label?: { label: string; description: string } }[]
  }>
}

export const sourceCompletionPreferences = () => ({
  aiCompletionEnabled: true,
  aiCompletionCloudContextConsent: true,
  aiCompletionLength: 'short' as const,
  aiCompletionNearbyContextEnabled: true,
  aiCompletionProviderId: 'provider-1',
  aiCompletionSnoozedUntil: null,
  aiCompletionTriggerMode: 'fast' as const,
  aiDefaultProviderId: null,
  documentCompletionEnabled: true,
})

export const sourceCompletionContext = {} as never

export const createSourceCompletionHarness = (
  initialValue = 'I plan to review the notes.\n\nI plan to',
) => {
  let contentListener: () => void = () => undefined
  let modelListener: () => void = () => undefined
  let blurListener: () => void = () => undefined
  let value = initialValue
  let version = 1
  let path = 'notes/current.md'
  const getLines = () => value.split('\n')
  const model = {
    getLineContent: (line: number) => getLines()[line - 1] ?? '',
    getLineCount: () => getLines().length,
    getOffsetAt: ({ lineNumber, column }: { lineNumber: number; column: number }) =>
      getLines()
        .slice(0, lineNumber - 1)
        .reduce((total, line) => total + line.length + 1, 0) +
      column -
      1,
    getWordUntilPosition: ({ lineNumber, column }: { lineNumber: number; column: number }) => {
      const word =
        (getLines()[lineNumber - 1] ?? '').slice(0, column - 1).match(/[\p{L}\p{N}_]+$/u)?.[0] ?? ''
      return { word, startColumn: column - word.length, endColumn: column }
    },
    getValue: vi.fn(() => value),
    getVersionId: () => version,
    isDisposed: () => false,
    uri: { toString: () => `file:///${path}` },
  }
  const editor = {
    addCommand: vi.fn(() => 'command-id'),
    getModel: () => model,
    getPosition: () => {
      const lines = getLines()
      return { lineNumber: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 }
    },
    getRawOptions: () => ({ readOnly: false }),
    inComposition: false,
    onDidBlurEditorText: (listener: () => void) => {
      blurListener = listener
      return { dispose: vi.fn() }
    },
    onDidChangeModel: (listener: () => void) => {
      modelListener = listener
      return { dispose: vi.fn() }
    },
    onDidChangeModelContent: (listener: () => void) => {
      contentListener = listener
      return { dispose: vi.fn() }
    },
    trigger: vi.fn(),
  }
  let provider: SourceTextProvider | null = null
  const monaco = {
    KeyCode: { BracketLeft: 92, BracketRight: 94 },
    KeyMod: { Alt: 512 },
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
    languages: {
      CompletionItemKind: { Text: 18 },
      registerCompletionItemProvider: vi.fn((_language: string, next: SourceTextProvider) => {
        provider = next
        return { dispose: vi.fn() }
      }),
    },
  }
  const tokenListeners = new Set<() => void>()
  const token = {
    isCancellationRequested: false,
    onCancellationRequested: (listener: () => void) => {
      tokenListeners.add(listener)
      return { dispose: () => tokenListeners.delete(listener) }
    },
  }
  const complete = () => {
    if (!provider) throw new Error('Inline provider was not registered')
    return provider.provideCompletionItems(model, editor.getPosition(), {}, token)
  }
  return {
    blur: () => blurListener(),
    cancelToken: () => {
      token.isCancellationRequested = true
      tokenListeners.forEach((listener) => listener())
    },
    change: (nextValue: string) => {
      value = nextValue
      version += 1
      contentListener()
    },
    complete,
    editor,
    model,
    monaco,
    position: () => editor.getPosition(),
    provider: () => {
      if (!provider) throw new Error('Inline provider was not registered')
      return provider
    },
    replaceModel: () => modelListener(),
    setPath: (nextPath: string) => {
      path = nextPath
    },
    token,
  }
}
