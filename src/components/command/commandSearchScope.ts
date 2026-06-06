export type CommandSearchScope = 'all' | 'files' | 'headings' | 'text'

export type ParsedCommandSearch = {
  scope: CommandSearchScope
  query: string
}

export const parseCommandSearchScope = (value: string): ParsedCommandSearch => {
  const trimmed = value.trim()
  const marker = trimmed[0]

  if (marker === '@') return { scope: 'files', query: trimmed.slice(1).trim() }
  if (marker === '#') return { scope: 'headings', query: trimmed.slice(1).trim() }
  if (marker === '?') return { scope: 'text', query: trimmed.slice(1).trim() }

  return { scope: 'all', query: trimmed }
}
