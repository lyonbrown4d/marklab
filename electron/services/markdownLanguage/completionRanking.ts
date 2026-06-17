import { createFileLabel } from '@electron/services/markdownLanguage/linkTargets.js'

export const compareFileCompletionPaths = ({
  activePath,
  query,
  left,
  right,
}: {
  activePath: string | null
  query: string
  left: string
  right: string
}) => {
  return (
    fileScore({ activePath, query, path: left }) - fileScore({ activePath, query, path: right }) ||
    left.localeCompare(right)
  )
}

export const fileCompletionSortText = ({
  activePath,
  query,
  path,
  label,
}: {
  activePath: string | null
  query: string
  path: string
  label: string
}) => {
  return `${String(fileScore({ activePath, query, path })).padStart(4, '0')}-${label}-${path}`
}

export const headingCompletionSortText = (text: string, slug: string, query: string) => {
  const normalizedText = text.toLowerCase()
  const normalizedQuery = query.toLowerCase()
  let score = 30
  if (!normalizedQuery) score = 10
  else if (normalizedText === normalizedQuery || slug === normalizedQuery) score = 0
  else if (normalizedText.startsWith(normalizedQuery) || slug.startsWith(normalizedQuery)) score = 5
  else if (normalizedText.includes(normalizedQuery) || slug.includes(normalizedQuery)) score = 15
  return `${String(score).padStart(4, '0')}-${text}`
}

const fileScore = ({
  activePath,
  query,
  path,
}: {
  activePath: string | null
  query: string
  path: string
}) => {
  const label = createFileLabel(path).toLowerCase()
  const normalizedPath = path.toLowerCase()
  const activeDir = activePath?.split('/').slice(0, -1).join('/') ?? ''
  const sameDir = activeDir && path.startsWith(`${activeDir}/`)
  const depth = path.split('/').length

  let score = sameDir ? 0 : 40
  if (query) {
    if (label === query) score += 0
    else if (label.startsWith(query)) score += 5
    else if (normalizedPath.startsWith(query)) score += 10
    else if (label.includes(query)) score += 20
    else score += 30
  }
  return score + depth
}
