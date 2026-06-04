type MarkdownLineDocument = {
  lineEnding: '\n' | '\r' | '\r\n'
  lines: string[]
  trailingLineEnding: boolean
}

export const replaceMarkdownHeadingTitle = (
  markdown: string,
  line: number,
  level: number,
  title: string,
) => {
  const lineIndex = lineNumberToIndex(line)
  if (lineIndex === null || level < 1) return markdown

  const document = parseMarkdownLines(markdown)
  if (!document.lines[lineIndex]) return markdown

  document.lines[lineIndex] = `${'#'.repeat(level)} ${normalizeHeadingTitle(title)}`
  return serializeMarkdownLines(document)
}

export const replaceMarkdownLineRange = (
  markdown: string,
  startLine: number,
  endLine: number,
  content: string,
) => {
  const startIndex = lineNumberToIndex(startLine)
  if (startIndex === null || endLine < startLine) return markdown

  const document = parseMarkdownLines(markdown)
  const nextLines = content.length === 0 ? [] : splitInputLines(content)
  document.lines.splice(startIndex, endLine - startLine, ...nextLines)
  return serializeMarkdownLines(document)
}

export const insertMarkdownHeadingAtLine = (
  markdown: string,
  line: number,
  level: number,
  title: string,
) => {
  const lineIndex = lineNumberToIndex(line)
  if (lineIndex === null || level < 1 || level > 6) return markdown

  const document = parseMarkdownLines(markdown)
  const insertIndex = Math.min(lineIndex, document.lines.length)
  document.lines.splice(insertIndex, 0, `${'#'.repeat(level)} ${normalizeHeadingTitle(title)}`)
  return serializeMarkdownLines(document)
}

const parseMarkdownLines = (markdown: string): MarkdownLineDocument => {
  return {
    lineEnding: detectLineEnding(markdown),
    lines: splitInputLines(markdown),
    trailingLineEnding: /(?:\r\n|\n|\r)$/.test(markdown),
  }
}

const serializeMarkdownLines = ({
  lineEnding,
  lines,
  trailingLineEnding,
}: MarkdownLineDocument) => {
  const joined = lines.join(lineEnding)
  return trailingLineEnding && !joined.endsWith(lineEnding) ? `${joined}${lineEnding}` : joined
}

const detectLineEnding = (markdown: string): MarkdownLineDocument['lineEnding'] => {
  if (markdown.includes('\r\n')) return '\r\n'
  if (markdown.includes('\r')) return '\r'
  return '\n'
}

const splitInputLines = (value: string) => {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

const lineNumberToIndex = (line: number) => {
  if (!Number.isInteger(line) || line < 1) return null
  return line - 1
}

const normalizeHeadingTitle = (title: string) => {
  return title
    .split(/\r\n|\r|\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
}
