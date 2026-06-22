export type MarkdownDocumentSymbol = {
  name: string
  level: number
  line: number
  column: number
  endColumn: number
  children: MarkdownDocumentSymbol[]
}

export const getMarkdownDocumentSymbols = (content: string): MarkdownDocumentSymbol[] => {
  const roots: MarkdownDocumentSymbol[] = []
  const stack: MarkdownDocumentSymbol[] = []
  const lines = content.split(/\r?\n/)

  lines.forEach((lineText, index) => {
    const match = lineText.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (!match) return

    const marker = match[1]
    const name = match[2].trim()
    const column = marker.length + 2
    const symbol: MarkdownDocumentSymbol = {
      name,
      level: marker.length,
      line: index + 1,
      column,
      endColumn: column + Math.max(1, name.length),
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
  })

  return roots
}
