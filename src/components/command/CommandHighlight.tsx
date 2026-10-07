import { Fragment } from 'react'

type CommandHighlightProps = {
  query: string
  text: string
}

const normalizeQuery = (query: string) => query.trim().replace(/^[@#?>]\s*/, '')

const CommandHighlight = ({ query, text }: CommandHighlightProps) => {
  const match = normalizeQuery(query)
  if (!match) return text

  const normalizedText = text.toLocaleLowerCase()
  const normalizedMatch = match.toLocaleLowerCase()
  const parts: Array<{ highlighted: boolean; text: string }> = []
  let cursor = 0
  let index = normalizedText.indexOf(normalizedMatch)

  while (index >= 0) {
    if (index > cursor) parts.push({ highlighted: false, text: text.slice(cursor, index) })
    const end = index + match.length
    parts.push({ highlighted: true, text: text.slice(index, end) })
    cursor = end
    index = normalizedText.indexOf(normalizedMatch, cursor)
  }

  if (parts.length === 0) return text
  if (cursor < text.length) parts.push({ highlighted: false, text: text.slice(cursor) })

  return parts.map((part, index) =>
    part.highlighted ? (
      <mark
        key={`${index}:${part.text}`}
        className="rounded-sm bg-amber-200/75 px-0.5 text-inherit dark:bg-amber-400/25"
      >
        {part.text}
      </mark>
    ) : (
      <Fragment key={`${index}:${part.text}`}>{part.text}</Fragment>
    ),
  )
}

export default CommandHighlight
