import type { ShortcutActionId } from '@/logic/shortcuts'

export type MarkdownSourceFormatAction = Extract<
  ShortcutActionId,
  | 'editor.paragraph'
  | `editor.heading${1 | 2 | 3 | 4 | 5 | 6}`
  | 'editor.bold'
  | 'editor.italic'
  | 'editor.inlineCode'
  | 'editor.strike'
  | 'editor.link'
  | 'editor.codeBlock'
  | 'editor.quote'
  | 'editor.orderedList'
  | 'editor.bulletList'
  | 'editor.table'
  | 'editor.clearFormat'
>

export const markdownSourceFormatActions: readonly MarkdownSourceFormatAction[] = [
  'editor.paragraph',
  'editor.heading1',
  'editor.heading2',
  'editor.heading3',
  'editor.heading4',
  'editor.heading5',
  'editor.heading6',
  'editor.bold',
  'editor.italic',
  'editor.inlineCode',
  'editor.strike',
  'editor.link',
  'editor.codeBlock',
  'editor.quote',
  'editor.orderedList',
  'editor.bulletList',
  'editor.table',
  'editor.clearFormat',
]

export type MarkdownSourceFormatRequest = {
  action: MarkdownSourceFormatAction
  text: string
  selectionStart: number
  selectionEnd: number
}

export type MarkdownSourceFormatResult = {
  text: string
  selectionStart: number
  selectionEnd: number
}

const inlineFormats: Partial<
  Record<MarkdownSourceFormatAction, { open: string; close: string; placeholder: string }>
> = {
  'editor.bold': { open: '**', close: '**', placeholder: 'text' },
  'editor.italic': { open: '_', close: '_', placeholder: 'text' },
  'editor.inlineCode': { open: '`', close: '`', placeholder: 'code' },
  'editor.strike': { open: '~~', close: '~~', placeholder: 'text' },
}

export const applyMarkdownSourceFormat = ({
  action,
  text,
  selectionStart,
  selectionEnd,
}: MarkdownSourceFormatRequest): MarkdownSourceFormatResult => {
  const start = Math.max(0, Math.min(selectionStart, selectionEnd, text.length))
  const end = Math.max(start, Math.min(Math.max(selectionStart, selectionEnd), text.length))
  const inline = inlineFormats[action]
  if (inline) return toggleInline(text, start, end, inline)
  if (action === 'editor.link') {
    return toggleInline(text, start, end, {
      open: '[',
      close: '](https://)',
      placeholder: 'link text',
    })
  }
  if (action === 'editor.table') return replaceSelection(text, start, end, gfmTable(), 2, 8)
  if (action === 'editor.codeBlock') return toggleCodeFence(text, start, end)
  if (action === 'editor.clearFormat') {
    return transformSelectedLines(text, start, end, (lines) =>
      lines.map((line) => clearLineFormatting(line)),
    )
  }

  return transformSelectedLines(text, start, end, (lines) => formatLines(action, lines))
}

const toggleInline = (
  text: string,
  start: number,
  end: number,
  format: { open: string; close: string; placeholder: string },
): MarkdownSourceFormatResult => {
  const selected = text.slice(start, end)
  const wrappedOutside =
    text.slice(Math.max(0, start - format.open.length), start) === format.open &&
    text.slice(end, end + format.close.length) === format.close
  if (wrappedOutside) {
    const replaceStart = start - format.open.length
    const replacement = selected
    return replaceSelection(
      text,
      replaceStart,
      end + format.close.length,
      replacement,
      0,
      replacement.length,
    )
  }

  const content = selected || format.placeholder
  return replaceSelection(
    text,
    start,
    end,
    `${format.open}${content}${format.close}`,
    format.open.length,
    format.open.length + content.length,
  )
}

const toggleCodeFence = (text: string, start: number, end: number): MarkdownSourceFormatResult => {
  const selected = text.slice(start, end)
  const match = selected.match(/^```[^\n]*\r?\n([\s\S]*?)\r?\n```$/)
  if (match) return replaceSelection(text, start, end, match[1] ?? '')
  const content = selected || 'code'
  return replaceSelection(text, start, end, `\`\`\`\n${content}\n\`\`\``, 4, 4 + content.length)
}

const transformSelectedLines = (
  text: string,
  start: number,
  end: number,
  transform: (lines: string[]) => string[],
): MarkdownSourceFormatResult => {
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const nextBreak = text.indexOf('\n', end)
  const lineEnd = nextBreak < 0 ? text.length : nextBreak
  const replacement = transform(text.slice(lineStart, lineEnd).split('\n')).join('\n')
  return replaceSelection(text, lineStart, lineEnd, replacement)
}

const formatLines = (action: MarkdownSourceFormatAction, lines: string[]): string[] => {
  if (action === 'editor.paragraph') return lines.map(stripBlockPrefix)
  const heading = action.match(/^editor\.heading([1-6])$/)
  if (heading) {
    const marker = `${'#'.repeat(Number(heading[1]))} `
    const alreadyApplied = lines.every((line) => line.startsWith(marker))
    return lines.map((line) =>
      alreadyApplied ? stripHeading(line) : marker + stripBlockPrefix(line),
    )
  }
  if (action === 'editor.quote') return toggleLinePrefix(lines, '> ')
  if (action === 'editor.bulletList') return toggleLinePrefix(lines, '- ', stripListPrefix)
  if (action === 'editor.orderedList') {
    const enabled = lines.every((line) => /^\d+\.\s/.test(line))
    return lines.map((line, index) =>
      enabled ? stripListPrefix(line) : `${index + 1}. ${stripListPrefix(line)}`,
    )
  }
  return lines
}

const toggleLinePrefix = (
  lines: string[],
  prefix: string,
  strip = (line: string) => line.slice(prefix.length),
) => {
  const enabled = lines.every((line) => line.startsWith(prefix))
  return lines.map((line) => (enabled ? strip(line) : prefix + stripBlockPrefix(line)))
}

const stripHeading = (line: string) => line.replace(/^#{1,6}\s+/, '')
const stripListPrefix = (line: string) => line.replace(/^\s*(?:[-+*]|\d+\.)\s+/, '')
const stripBlockPrefix = (line: string) =>
  stripListPrefix(stripHeading(line).replace(/^\s*>\s?/, ''))

const clearLineFormatting = (line: string) =>
  stripBlockPrefix(line)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, '$1$2')

const replaceSelection = (
  text: string,
  start: number,
  end: number,
  replacement: string,
  relativeSelectionStart = 0,
  relativeSelectionEnd = replacement.length,
): MarkdownSourceFormatResult => ({
  text: text.slice(0, start) + replacement + text.slice(end),
  selectionStart: start + relativeSelectionStart,
  selectionEnd: start + relativeSelectionEnd,
})

const gfmTable = () =>
  [
    '| Header 1 | Header 2 | Header 3 |',
    '| --- | --- | --- |',
    '| Cell | Cell | Cell |',
    '| Cell | Cell | Cell |',
  ].join('\n')
