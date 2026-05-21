export const normalizeHtmlBreaks = (markdown: string): string => {
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

export const unescapeMarkdownText = (value: string): string => {
  return value.replace(/\\([\\`*_[\]{}()#+\-.!|>])/g, '$1')
}

export const isAsciiDigit = (value: string): boolean => {
  return /^[0-9]$/.test(value)
}

export const isAsciiAlphanumeric = (value: string): boolean => {
  return /^[A-Za-z0-9]$/.test(value)
}

const htmlBreakReplacement = (input: string): number | null => {
  const match = /^<\/?br\s*\/?>/i.exec(input)
  return match?.[0].length ?? null
}

const countRepeated = (text: string, start: number, char: string): number => {
  let count = 0
  while (text[start + count] === char) count += 1
  return count
}
