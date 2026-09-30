export type CompletionMock = {
  provideCompletionItems: (
    model: { getValue: () => string; getVersionId: () => number; isDisposed: () => boolean },
    position: { lineNumber: number; column: number },
  ) => Promise<{ suggestions: Array<Record<string, unknown>> }>
}

export type SymbolMock = {
  provideDocumentSymbols: (model: {
    getValue: () => string
  }) => Promise<Array<Record<string, unknown>>>
}
