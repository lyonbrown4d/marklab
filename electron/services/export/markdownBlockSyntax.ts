export const splitTableRow = (line: string): string[] => {
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

export const isTableSeparator = (line: string): boolean => {
  const cells = splitTableRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

export const listMarker = (line: string): { ordered: boolean; text: string } | null => {
  const unordered = /^\s{0,3}[-*+]\s+(.+)$/.exec(line)
  if (unordered) return { ordered: false, text: unordered[1]?.trim() ?? '' }
  const ordered = /^\s{0,3}\d+[.)]\s+(.+)$/.exec(line)
  if (ordered) return { ordered: true, text: ordered[1]?.trim() ?? '' }
  return null
}

export const isBlockStart = (line: string): boolean => {
  return Boolean(
    openingFence(line) ||
    /^(#{1,6})\s+/.test(line) ||
    isThematicBreak(line) ||
    isBlockquoteLine(line) ||
    isTableSeparator(line),
  )
}

export const openingFence = (line: string): { marker: string; language?: string } | null => {
  const match = /^\s{0,3}(`{3,}|~{3,})(.*)$/.exec(line)
  if (!match) return null
  const info = (match[2] ?? '').trim()
  return { marker: match[1] ?? '```', language: info || undefined }
}

export const isClosingFence = (line: string, fence: string): boolean => {
  return line.trimStart().startsWith(fence)
}

export const isThematicBreak = (line: string): boolean => {
  const normalized = line.trim().replace(/\s+/g, '')
  return /^-{3,}$/.test(normalized) || /^\*{3,}$/.test(normalized) || /^_{3,}$/.test(normalized)
}

export const isBlockquoteLine = (line: string): boolean => {
  return /^\s{0,3}>/.test(line)
}

export const stripBlockquotePrefix = (line: string): string => {
  return line.replace(/^\s{0,3}>\s?/, '')
}
