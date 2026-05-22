import {
  isAsciiAlphanumeric,
  isAsciiDigit,
  unescapeMarkdownText,
} from '@electron/services/export/markdownText.js'
import type { MarkdownInline } from '@electron/services/export/markdownTypes.js'

type LinkDestination = {
  url: string
  title?: string
}

export const plainTextFromInlines = (inlines: MarkdownInline[]): string => {
  return inlines
    .map((inline) => {
      if (inline.type === 'text' || inline.type === 'code') return inline.text
      if (inline.type === 'image') return inline.alt || inline.url
      return plainTextFromInlines(inline.children)
    })
    .join('')
}

export const parseInlines = (text: string): MarkdownInline[] => {
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

const parseCodeSpan = (text: string, start: number): { text: string; nextIndex: number } | null => {
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

const parseImage = (
  text: string,
  start: number,
): { inline: MarkdownInline; nextIndex: number } | null => {
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

const parseLink = (
  text: string,
  start: number,
): { inline: MarkdownInline; nextIndex: number } | null => {
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

const parseDelimitedInline = (
  text: string,
  start: number,
  marker: '*' | '**' | '_' | '__',
  type: 'strong' | 'emphasis',
): { inline: MarkdownInline; nextIndex: number } | null => {
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

const parseLinkDestination = (
  text: string,
  start: number,
): (LinkDestination & { nextIndex: number }) | null => {
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

const splitDestinationAndTitle = (raw: string): LinkDestination => {
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

const parseOptionalTitle = (value: string): string | undefined => {
  const trimmed = value.trim()
  const match = /^["']([^"']+)["']$/.exec(trimmed)
  return match?.[1]
}

const findClosingBracket = (text: string, openIndex: number): number => {
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

const findClosingMarker = (text: string, marker: string, start: number): number => {
  let index = start
  while (index < text.length) {
    const next = text.indexOf(marker, index)
    if (next < 0) return -1
    if (text[next - 1] !== '\\' && canCloseEmphasis(text, next, marker)) return next
    index = next + marker.length
  }
  return -1
}

const nextInlineMarker = (text: string, start: number): number => {
  const markers = ['`', '![', '[', '**', '__', '*', '_']
  const positions = markers
    .map((marker) => text.indexOf(marker, start))
    .filter((position) => position >= 0)
  return positions.length > 0 ? Math.min(...positions) : text.length
}

const canOpenEmphasis = (text: string, start: number, marker: string): boolean => {
  const previous = text[start - 1] ?? ''
  const next = text[start + marker.length] ?? ''
  if (!next.trim()) return false
  if (isAsciiAlphanumeric(previous) && marker.startsWith('_')) return false
  return !(isAsciiDigit(previous) && isAsciiDigit(next))
}

const canCloseEmphasis = (text: string, start: number, marker: string): boolean => {
  const previous = text[start - 1] ?? ''
  const next = text[start + marker.length] ?? ''
  if (!previous.trim()) return false
  if (isAsciiAlphanumeric(next) && marker.startsWith('_')) return false
  return !(isAsciiDigit(previous) && isAsciiDigit(next))
}
