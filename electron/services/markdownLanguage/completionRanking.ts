import Fuse from 'fuse.js'

import { createFileLabel } from '@electron/services/markdownLanguage/linkTargets.js'

type FileCompletionCandidate = {
  path: string
  label: string
  normalizedPath: string
  normalizedLabel: string
  sameDir: boolean
  depth: number
}

type RankedFileCompletionCandidate = FileCompletionCandidate & {
  rank: number
}

type HeadingCompletionCandidate = {
  text: string
  slug: string
}

const FILE_FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  shouldSort: false,
  threshold: 0.45,
  keys: [
    { name: 'label', weight: 0.72 },
    { name: 'path', weight: 0.28 },
  ],
}

const MAX_FILE_FUSE_SCORE = 0.45
const MAX_HEADING_FUSE_SCORE = 0.6

const HEADING_FUSE_OPTIONS = {
  includeScore: true,
  ignoreLocation: true,
  shouldSort: false,
  threshold: 0.42,
  keys: [
    { name: 'text', weight: 0.7 },
    { name: 'slug', weight: 0.3 },
  ],
}

export const rankFileCompletionPaths = ({
  activePath,
  query,
  paths,
}: {
  activePath: string | null
  query: string
  paths: string[]
}) => {
  const candidates = paths.map((path) => createFileCompletionCandidate(activePath, path))
  const normalizedQuery = normalizeQuery(query)

  if (!normalizedQuery) {
    return candidates.sort(compareFileCandidates).map((candidate) => candidate.path)
  }

  const fuzzyMatches = new Fuse(candidates, FILE_FUSE_OPTIONS).search(normalizedQuery)
  const ranked = new Map<string, RankedFileCompletionCandidate>()

  for (const result of fuzzyMatches) {
    if ((result.score ?? 1) > MAX_FILE_FUSE_SCORE) continue
    ranked.set(result.item.path, {
      ...result.item,
      rank: fileRank({ candidate: result.item, query: normalizedQuery, fuseScore: result.score }),
    })
  }

  for (const candidate of candidates) {
    if (!fileCandidateContainsQuery(candidate, normalizedQuery) || ranked.has(candidate.path)) {
      continue
    }
    ranked.set(candidate.path, {
      ...candidate,
      rank: fileRank({ candidate, query: normalizedQuery, fuseScore: 0.35 }),
    })
  }

  return Array.from(ranked.values())
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        compareFileCandidates(left, right) ||
        left.path.localeCompare(right.path),
    )
    .map((candidate) => candidate.path)
}

export const rankHeadingCompletionItems = <T extends HeadingCompletionCandidate>(
  headings: T[],
  query: string,
): T[] => {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return headings

  const fuzzyMatches = new Fuse(headings, HEADING_FUSE_OPTIONS).search(normalizedQuery)
  const ranked = new Map<T, { item: T; rank: number }>()

  for (const result of fuzzyMatches) {
    if ((result.score ?? 1) > MAX_HEADING_FUSE_SCORE) continue
    ranked.set(result.item, {
      item: result.item,
      rank: headingRank({
        text: result.item.text,
        slug: result.item.slug,
        query: normalizedQuery,
        fuseScore: result.score,
      }),
    })
  }

  for (const heading of headings) {
    if (!headingCandidateContainsQuery(heading, normalizedQuery) || ranked.has(heading)) continue
    ranked.set(heading, {
      item: heading,
      rank: headingRank({
        text: heading.text,
        slug: heading.slug,
        query: normalizedQuery,
        fuseScore: 0.35,
      }),
    })
  }

  return Array.from(ranked.values())
    .sort((left, right) => left.rank - right.rank || left.item.text.localeCompare(right.item.text))
    .map((result) => result.item)
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
  return `${String(fileSortTextScore({ activePath, query, path })).padStart(4, '0')}-${label}-${path}`
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

const createFileCompletionCandidate = (
  activePath: string | null,
  path: string,
): FileCompletionCandidate => {
  const activeDir = activePath?.split('/').slice(0, -1).join('/') ?? ''
  const label = createFileLabel(path)
  return {
    path,
    label,
    normalizedPath: path.toLowerCase(),
    normalizedLabel: label.toLowerCase(),
    sameDir: Boolean(activeDir && path.startsWith(`${activeDir}/`)),
    depth: path.split('/').length,
  }
}

const compareFileCandidates = (
  left: FileCompletionCandidate,
  right: FileCompletionCandidate,
): number => {
  return (
    Number(right.sameDir) - Number(left.sameDir) ||
    left.depth - right.depth ||
    left.label.localeCompare(right.label) ||
    left.path.localeCompare(right.path)
  )
}

const fileCandidateContainsQuery = (
  candidate: FileCompletionCandidate,
  normalizedQuery: string,
): boolean => {
  return (
    candidate.normalizedLabel.includes(normalizedQuery) ||
    candidate.normalizedPath.includes(normalizedQuery)
  )
}

const headingCandidateContainsQuery = (
  heading: HeadingCompletionCandidate,
  normalizedQuery: string,
): boolean => {
  return (
    heading.text.toLowerCase().includes(normalizedQuery) ||
    heading.slug.toLowerCase().includes(normalizedQuery)
  )
}

const fileRank = ({
  candidate,
  query,
  fuseScore,
}: {
  candidate: FileCompletionCandidate
  query: string
  fuseScore?: number
}) => {
  return (
    (candidate.sameDir ? 0 : 35) +
    (fuseScore ?? 1) * 70 +
    exactFileMatchBonus(candidate, query) +
    candidate.depth
  )
}

const exactFileMatchBonus = (candidate: FileCompletionCandidate, query: string) => {
  if (candidate.normalizedLabel === query) return -18
  if (candidate.normalizedLabel.startsWith(query)) return -12
  if (candidate.normalizedPath.startsWith(query)) return -8
  if (candidate.normalizedLabel.includes(query)) return -5
  return 0
}

const headingRank = ({
  text,
  slug,
  query,
  fuseScore,
}: {
  text: string
  slug: string
  query: string
  fuseScore?: number
}) => {
  const normalizedText = text.toLowerCase()
  const normalizedSlug = slug.toLowerCase()
  let exactBonus = 0
  if (normalizedText === query || normalizedSlug === query) exactBonus = -18
  else if (normalizedText.startsWith(query) || normalizedSlug.startsWith(query)) exactBonus = -12
  else if (normalizedText.includes(query) || normalizedSlug.includes(query)) exactBonus = -5
  return (fuseScore ?? 1) * 70 + exactBonus
}

const fileSortTextScore = ({
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

const normalizeQuery = (query: string) => query.trim().toLowerCase()
