import type { editor as MonacoEditor, languages as MonacoLanguages } from 'monaco-editor'
import { getMarkdownDocumentSymbols } from '@/logic/markdownDocumentSymbols'
import { isDesktopRuntime } from '@/runtime/environment'
import { markdownLanguageApi } from '@/services/markdownLanguageApi'
import type { MarkdownSourceCompletionContext } from '@/components/markdownSourceCompletion'

type MonacoModule = typeof import('monaco-editor')
type CancellationLike = { isCancellationRequested: boolean }
type MarkdownSymbol = {
  name: string
  level: number
  line: number
  column: number
  endColumn: number
  children: MarkdownSymbol[]
}

export const registerMarkdownDocumentSymbolProvider = (
  monaco: MonacoModule,
  getContext: () => MarkdownSourceCompletionContext,
) => {
  return monaco.languages.registerDocumentSymbolProvider('markdown', {
    provideDocumentSymbols: async (
      model: MonacoEditor.ITextModel,
      token: CancellationLike = { isCancellationRequested: false },
    ) => {
      const content = model.getValue()
      const context = getContext()
      const symbols: MarkdownSymbol[] =
        isDesktopRuntime() && context.activePath
          ? await markdownLanguageApi
              .getDocumentSymbols({ path: context.activePath, content })
              .catch(() => getMarkdownDocumentSymbols(content))
          : getMarkdownDocumentSymbols(content)

      if (token.isCancellationRequested) return []
      return symbols.map((symbol) => toMonacoSymbol(monaco, symbol))
    },
  })
}

const toMonacoSymbol = (
  monaco: MonacoModule,
  symbol: MarkdownSymbol,
): MonacoLanguages.DocumentSymbol => ({
  name: symbol.name,
  detail: `H${symbol.level}`,
  kind: monaco.languages.SymbolKind.String,
  tags: [],
  range: new monaco.Range(symbol.line, 1, symbol.line, symbol.endColumn),
  selectionRange: new monaco.Range(symbol.line, symbol.column, symbol.line, symbol.endColumn),
  children: symbol.children.map((child) => toMonacoSymbol(monaco, child)),
})
