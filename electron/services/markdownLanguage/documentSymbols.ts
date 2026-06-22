import { SymbolKind } from 'vscode-languageserver-types'
import { parseMarkdownDocument } from '@electron/services/workspace/markdown.js'
import { charLength } from '@electron/services/workspace/markdown/text.js'
import type {
  DocumentSymbolsRequest,
  MarkdownLanguageDocumentSymbol,
} from '@electron/services/markdownLanguage/types.js'

export const getMarkdownDocumentSymbols = ({
  content,
  path,
}: DocumentSymbolsRequest): MarkdownLanguageDocumentSymbol[] => {
  const parsed = parseMarkdownDocument(path ?? '', content)
  const roots: MarkdownLanguageDocumentSymbol[] = []
  const stack: MarkdownLanguageDocumentSymbol[] = []

  for (const heading of parsed.headings) {
    const textColumn = heading.column + heading.level + 1
    const symbol: MarkdownLanguageDocumentSymbol = {
      name: heading.text,
      level: heading.level,
      line: heading.line,
      column: textColumn,
      endColumn: textColumn + Math.max(1, charLength(heading.text)),
      lspKind: SymbolKind.String,
      children: [],
    }

    while (stack.length > 0 && stack[stack.length - 1].level >= symbol.level) {
      stack.pop()
    }

    const parent = stack[stack.length - 1]
    if (parent) {
      parent.children.push(symbol)
    } else {
      roots.push(symbol)
    }
    stack.push(symbol)
  }

  return roots
}
