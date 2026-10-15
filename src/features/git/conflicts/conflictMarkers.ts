export type ConflictChoice = 'ours' | 'theirs' | 'both'
export type ConflictBlock = {
  start: number
  end: number
  line: number
  ours: string
  theirs: string
  base: string | null
}
type Line = { text: string; start: number; end: number; number: number }

const readLines = (content: string): Line[] => {
  const lines: Line[] = []
  const pattern = /[^\r\n]*(?:\r\n|\n|\r|$)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) && match[0]) {
    lines.push({
      text: match[0].replace(/[\r\n]+$/, ''),
      start: match.index,
      end: pattern.lastIndex,
      number: lines.length + 1,
    })
  }
  return lines
}

// Normal, diff3 and zdiff3 use the same marker boundaries. zdiff3 shared context
// lives outside those boundaries and must remain untouched when choosing a side.
export const parseConflictMarkers = (content: string, markerSize = 7): ConflictBlock[] => {
  const lines = readLines(content)
  const blocks: ConflictBlock[] = []
  for (let index = 0; index < lines.length; index++) {
    const opening = lines[index]!
    const width = opening.text.match(/^(<+)(?:\s.*)?$/)?.[1]?.length
    if (!width || width > 1024 || (width < 7 && width !== markerSize)) continue
    let separator = -1
    let ancestor = -1
    let closing = -1
    for (let cursor = index + 1; cursor < lines.length; cursor++) {
      const text = lines[cursor]!.text
      const nested = text.match(/^(<+)(?:\s.*)?$/)?.[1]?.length
      if (nested && nested <= 1024 && (nested >= 7 || nested === markerSize)) break
      if (text === '='.repeat(width) && separator < 0) separator = cursor
      else if (separator < 0 && new RegExp(`^\\|{${width}}(?:\\s.*)?$`).test(text))
        ancestor = cursor
      else if (separator >= 0 && new RegExp(`^>{${width}}(?:\\s.*)?$`).test(text)) {
        closing = cursor
        break
      }
    }
    if (separator < 0 || closing < 0) continue
    blocks.push({
      start: opening.start,
      end: lines[closing]!.end,
      line: opening.number,
      ours: content.slice(opening.end, lines[ancestor >= 0 ? ancestor : separator]!.start),
      base: ancestor < 0 ? null : content.slice(lines[ancestor]!.end, lines[separator]!.start),
      theirs: content.slice(lines[separator]!.end, lines[closing]!.start),
    })
    index = closing
  }
  return blocks
}

export const hasConflictMarkers = (content: string, markerSize = 7): boolean => {
  const size = Number.isInteger(markerSize) && markerSize > 0 && markerSize <= 1024 ? markerSize : 7
  return new RegExp(
    `^(?:(?:<{${size}}|<{7,})(?:\\s.*)?|(?:\\|{${size}}|\\|{7,})(?:\\s.*)?|(?:={${size}}|={7,})|(?:>{${size}}|>{7,})(?:\\s.*)?)\\r?$`,
    'm',
  ).test(content)
}

export const conflictChoiceContent = (block: ConflictBlock, choice: ConflictChoice): string =>
  choice === 'ours' ? block.ours : choice === 'theirs' ? block.theirs : block.ours + block.theirs
