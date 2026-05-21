export type MarkdownInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'emphasis'; children: MarkdownInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; url: string; title?: string; children: MarkdownInline[] }
  | { type: 'image'; url: string; title?: string; alt: string }

export type MarkdownBlock =
  | { type: 'heading'; level: number; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'blockquote'; blocks: MarkdownBlock[] }
  | { type: 'codeBlock'; text: string; language?: string }
  | { type: 'list'; ordered: boolean; items: MarkdownInline[][] }
  | { type: 'thematicBreak' }
  | { type: 'table'; header: MarkdownInline[][]; rows: MarkdownInline[][][] }

type LinkDestination = {
  url: string
  title?: string
}

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = normalizeMarkdownForExport(markdown).split(/\r?\n/)
  return parseBlocks(lines)
}

export function normalizeMarkdownForExport(markdown: string): string {
  return normalizeHtmlBreaks(markdown)
}

function parseBlocks(lines: string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = []
  let index = 0
  let paragraph: string[] = []

  const flushParagraph = () => {
    const text = paragraph.join(' ').trim()
    paragraph = []
    if (text) blocks.push({ type: 'paragraph', children: parseInlines(text) })
  }

  while (index < lines.length) {
    const line = lines[index] ?? ''

    const fence = openingFence(line)
    if (fence) {
      flushParagraph()
      const code: string[] = []
      index += 1
      while (index < lines.length) {
        const nextLine = lines[index] ?? ''
        if (isClosingFence(nextLine, fence.marker)) break
        code.push(nextLine)
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push({ type: 'codeBlock', text: code.join('\n'), language: fence.language })
      continue
    }

    if (!line.trim()) {
      flushParagraph()
      index += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (heading) {
      flushParagraph()
      blocks.push({
        type: 'heading',
        level: heading[1]?.length ?? 1,
        children: parseInlines(heading[2] ?? ''),
      })
      index += 1
      continue
    }

    if (isThematicBreak(line)) {
      flushParagraph()
      blocks.push({ type: 'thematicBreak' })
      index += 1
      continue
    }

    if (isBlockquoteLine(line)) {
      flushParagraph()
      const quoteLines: string[] = []
      while (index < lines.length && isBlockquoteLine(lines[index] ?? '')) {
        quoteLines.push(stripBlockquotePrefix(lines[index] ?? ''))
        index += 1
      }
      blocks.push({ type: 'blockquote', blocks: parseBlocks(quoteLines) })
      continue
    }

    const table = parseTable(lines, index)
    if (table) {
      flushParagraph()
      blocks.push(table.block)
      index = table.nextIndex
      continue
    }

    const list = parseList(lines, index)
    if (list) {
      flushParagraph()
      blocks.push(list.block)
      index = list.nextIndex
      continue
    }

    paragraph.push(line.trim())
    index += 1
  }

  flushParagraph()
  return blocks
}

function parseList(
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null {
  const first = listMarker(lines[startIndex] ?? '')
  if (!first) return null

  const items: MarkdownInline[][] = []
  let index = startIndex

  while (index < lines.length) {
    const marker = listMarker(lines[index] ?? '')
    if (!marker || marker.ordered !== first.ordered) break

    const parts = [marker.text]
    index += 1

    while (index < lines.length) {
      const continuation = lines[index] ?? ''
      if (!continuation.trim()) {
        index += 1
        break
      }
      if (listMarker(continuation) || isBlockStart(continuation)) break
      parts.push(continuation.trim())
      index += 1
    }

    items.push(parseInlines(parts.join(' ').trim()))
  }

  return { block: { type: 'list', ordered: first.ordered, items }, nextIndex: index }
}

function parseTable(
  lines: string[],
  startIndex: number,
): { block: MarkdownBlock; nextIndex: number } | null {
  const headerLine = lines[startIndex] ?? ''
  const separatorLine = lines[startIndex + 1] ?? ''
  if (!headerLine.includes('|') || !isTableSeparator(separatorLine)) return null

  const header = splitTableRow(headerLine)
  const separator = splitTableRow(separatorLine)
  if (header.length === 0 || separator.length < header.length) return null

  const rows: MarkdownInline[][][] = []
  let index = startIndex + 2
  while (index < lines.length) {
    const rowLine = lines[index] ?? ''
    if (!rowLine.trim() || !rowLine.includes('|')) break
    rows.push(splitTableRow(rowLine).map((cell) => parseInlines(cell.trim())))
    index += 1
  }

  return {
    block: {
      type: 'table',
      header: header.map((cell) => parseInlines(cell.trim())),
      rows,
    },
    nextIndex: index,
  }
}

export function plainTextFromInlines(inlines: MarkdownInline[]): string {
  return inlines
    .map((inline) => {
      if (inline.type === 'text' || inline.type === 'code') return inline.text
      if (inline.type === 'image') return inline.alt || inline.url
      return plainTextFromInlines(inline.children)
    })
    .join('')
}

function parseInlines(text: string): MarkdownInline[] {
  const inlines: MarkdownInline[] = []
  let index = 0

  const pushText = (value: string) => {
    if (!value) return
    const textValue = unescapeMarkdownText(value)
    const previous = inlines[inlines.length - 1]
    if (previous?.type === 'text') {
      previous.text += textValue
    } else {
      inlines.push({ type: 'text', text: textValue })
    }
  }

  while (index < text.length) {
    const codeSpan = parseCodeSpan(text, index)
    if (codeSpan) {
      inlines.push({ type: 'code', text: codeSpan.text })
      index = codeSpan.nextIndex
      continue
    }

    const image = parseImage(text, index)
    if (image) {
      inlines.push(image.inline)
      index = image.nextIndex
      continue
    }

    const link = parseLink(text, index)
    if (link) {
      inlines.push(link.inline)
      index = link.nextIndex
      continue
    }

    const strong = parseDelimitedInline(text, index, '**', 'strong')
    if (strong) {
      inlines.push(strong.inline)
      index = strong.nextIndex
      continue
    }

    const strongUnderscore = parseDelimitedInline(text, index, '__', 'strong')
    if (strongUnderscore) {
      inlines.push(strongUnderscore.inline)
      index = strongUnderscore.nextIndex
      continue
    }

    const emphasis = parseDelimitedInline(text, index, '*', 'emphasis')
    if (emphasis) {
      inlines.push(emphasis.inline)
      index = emphasis.nextIndex
      continue
    }

    const emphasisUnderscore = parseDelimitedInline(text, index, '_', 'emphasis')
    if (emphasisUnderscore) {
      inlines.push(emphasisUnderscore.inline)
      index = emphasisUnderscore.nextIndex
      continue
    }

    const next = nextInlineMarker(text, index + 1)
    pushText(text.slice(index, next))
    index = next
  }

  return inlines
}

function parseCodeSpan(text: string, start: number): { text: string; nextIndex: number } | null {
  if (text[start] !== '`') return null
  let fenceLength = 0
  while (text[start + fenceLength] === '`') fenceLength += 1
  const fence = '`'.repeat(fenceLength)
  const end = text.indexOf(fence, start + fenceLength)
  if (end < 0) return null
  return {
    text: text.slice(start + fenceLength, end).replace(/\s+/g, ' '),
    nextIndex: end + fenceLength,
  }
}

function parseImage(
  text: string,
  start: number,
): { inline: MarkdownInline; nextIndex: number } | null {
  if (!text.startsWith('![', start)) return null
  const labelEnd = findClosingBracket(text, start + 1)
  if (labelEnd < 0 || text[labelEnd + 1] !== '(') return null
  const destination = parseLinkDestination(text, labelEnd + 2)
  if (!destination) return null
  return {
    inline: {
      type: 'image',
      alt: plainTextFromInlines(parseInlines(text.slice(start + 2, labelEnd))),
      url: destination.url,
      title: destination.title,
    },
    nextIndex: destination.nextIndex,
  }
}

function parseLink(
  text: string,
  start: number,
): { inline: MarkdownInline; nextIndex: number } | null {
  if (text[start] !== '[' || text[start - 1] === '!') return null
  const labelEnd = findClosingBracket(text, start)
  if (labelEnd < 0 || text[labelEnd + 1] !== '(') return null
  const destination = parseLinkDestination(text, labelEnd + 2)
  if (!destination) return null
  return {
    inline: {
      type: 'link',
      children: parseInlines(text.slice(start + 1, labelEnd)),
      url: destination.url,
      title: destination.title,
    },
    nextIndex: destination.nextIndex,
  }
}

function parseDelimitedInline(
  text: string,
  start: number,
  marker: '*' | '**' | '_' | '__',
  type: 'strong' | 'emphasis',
): { inline: MarkdownInline; nextIndex: number } | null {
  if (!text.startsWith(marker, start)) return null
  if (marker.length === 1 && text.startsWith(marker.repeat(2), start)) return null
  if (!canOpenEmphasis(text, start, marker)) return null

  const contentStart = start + marker.length
  const end = findClosingMarker(text, marker, contentStart)
  if (end <= contentStart) return null

  const children = parseInlines(text.slice(contentStart, end))
  return {
    inline: { type, children },
    nextIndex: end + marker.length,
  }
}

function parseLinkDestination(
  text: string,
  start: number,
): (LinkDestination & { nextIndex: number }) | null {
  let index = start
  let depth = 0
  let inCode = false

  while (index < text.length) {
    const char = text[index]
    if (char === '`') inCode = !inCode
    if (!inCode && char === '(') depth += 1
    if (!inCode && char === ')') {
      if (depth === 0) {
        const raw = text.slice(start, index).trim()
        if (!raw) return null
        return { ...splitDestinationAndTitle(raw), nextIndex: index + 1 }
      }
      depth -= 1
    }
    index += 1
  }

  return null
}

function splitDestinationAndTitle(raw: string): LinkDestination {
  const trimmed = raw.trim()
  if (trimmed.startsWith('<')) {
    const end = trimmed.indexOf('>')
    if (end > 0)
      return { url: trimmed.slice(1, end), title: parseOptionalTitle(trimmed.slice(end + 1)) }
  }

  const match = /^(\S+)(?:\s+["']([^"']+)["'])?$/.exec(trimmed)
  if (match) return { url: match[1] ?? '', title: match[2] }
  return { url: trimmed }
}

function parseOptionalTitle(value: string): string | undefined {
  const trimmed = value.trim()
  const match = /^["']([^"']+)["']$/.exec(trimmed)
  return match?.[1]
}

function findClosingBracket(text: string, openIndex: number): number {
  let index = openIndex + 1
  let depth = 0
  while (index < text.length) {
    const char = text[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '[') depth += 1
    if (char === ']') {
      if (depth === 0) return index
      depth -= 1
    }
    index += 1
  }
  return -1
}

function findClosingMarker(text: string, marker: string, start: number): number {
  let index = start
  while (index < text.length) {
    const next = text.indexOf(marker, index)
    if (next < 0) return -1
    if (text[next - 1] !== '\\' && canCloseEmphasis(text, next, marker)) return next
    index = next + marker.length
  }
  return -1
}

function nextInlineMarker(text: string, start: number): number {
  const markers = ['`', '![', '[', '**', '__', '*', '_']
  const positions = markers
    .map((marker) => text.indexOf(marker, start))
    .filter((position) => position >= 0)
  return positions.length > 0 ? Math.min(...positions) : text.length
}

function canOpenEmphasis(text: string, start: number, marker: string): boolean {
  const previous = text[start - 1] ?? ''
  const next = text[start + marker.length] ?? ''
  if (!next.trim()) return false
  if (isAsciiAlphanumeric(previous) && marker.startsWith('_')) return false
  return !(isAsciiDigit(previous) && isAsciiDigit(next))
}

function canCloseEmphasis(text: string, start: number, marker: string): boolean {
  const previous = text[start - 1] ?? ''
  const next = text[start + marker.length] ?? ''
  if (!previous.trim()) return false
  if (isAsciiAlphanumeric(next) && marker.startsWith('_')) return false
  return !(isAsciiDigit(previous) && isAsciiDigit(next))
}

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  let inCode = false
  let escaped = false

  for (const char of trimmed) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '`') inCode = !inCode
    if (char === '|' && !inCode) {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }

  cells.push(current)
  return cells
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function listMarker(line: string): { ordered: boolean; text: string } | null {
  const unordered = /^\s{0,3}[-*+]\s+(.+)$/.exec(line)
  if (unordered) return { ordered: false, text: unordered[1]?.trim() ?? '' }
  const ordered = /^\s{0,3}\d+[.)]\s+(.+)$/.exec(line)
  if (ordered) return { ordered: true, text: ordered[1]?.trim() ?? '' }
  return null
}

function isBlockStart(line: string): boolean {
  return Boolean(
    openingFence(line) ||
    /^(#{1,6})\s+/.test(line) ||
    isThematicBreak(line) ||
    isBlockquoteLine(line) ||
    isTableSeparator(line),
  )
}

function openingFence(line: string): { marker: string; language?: string } | null {
  const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line)
  if (!match) return null
  const info = (match[2] ?? '').trim()
  return { marker: match[1] ?? '```', language: info || undefined }
}

function isClosingFence(line: string, fence: string): boolean {
  return line.trimStart().startsWith(fence)
}

function isThematicBreak(line: string): boolean {
  const normalized = line.trim().replace(/\s+/g, '')
  return /^-{3,}$/.test(normalized) || /^\*{3,}$/.test(normalized) || /^_{3,}$/.test(normalized)
}

function isBlockquoteLine(line: string): boolean {
  return /^\s{0,3}>/.test(line)
}

function stripBlockquotePrefix(line: string): string {
  return line.replace(/^\s{0,3}>\s?/, '')
}

function normalizeHtmlBreaks(markdown: string): string {
  let output = ''
  let index = 0
  let inCodeFence: '`' | '~' | null = null
  let inlineCodeTicks = 0

  while (index < markdown.length) {
    const char = markdown[index] ?? ''

    if (inCodeFence) {
      output += char
      if (char === inCodeFence) {
        const ticks = countRepeated(markdown, index, char)
        output += char.repeat(ticks - 1)
        index += ticks
        if (ticks >= 3) inCodeFence = null
        continue
      }
      index += 1
      continue
    }

    if (char === '`' || char === '~') {
      const ticks = countRepeated(markdown, index, char)
      output += char.repeat(ticks)
      index += ticks
      if (ticks >= 3) {
        inCodeFence = char
      } else if (char === '`') {
        inlineCodeTicks = inlineCodeTicks === ticks ? 0 : ticks
      }
      continue
    }

    if (inlineCodeTicks === 0 && char === '<') {
      const replacement = htmlBreakReplacement(markdown.slice(index))
      if (replacement) {
        output += '\n'
        index += replacement
        continue
      }
    }

    output += char
    index += 1
  }

  return output
}

function htmlBreakReplacement(input: string): number | null {
  const match = /^<\/?br\s*\/?>/i.exec(input)
  return match?.[0].length ?? null
}

function countRepeated(text: string, start: number, char: string): number {
  let count = 0
  while (text[start + count] === char) count += 1
  return count
}

function unescapeMarkdownText(value: string): string {
  return value.replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, '$1')
}

function isAsciiDigit(value: string): boolean {
  return /^[0-9]$/.test(value)
}

function isAsciiAlphanumeric(value: string): boolean {
  return /^[A-Za-z0-9]$/.test(value)
}
