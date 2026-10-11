import type {
  PlateDocumentFindTextBlock,
  PlateDocumentFindTextEntry,
  PlateDocumentFindWorkerMatch,
  PlateDocumentFindWorkerOptions,
} from '@/workers/plateDocumentFindWorkerProtocol'

const wordCharacter = '[\\p{L}\\p{N}_]'
const maxPatternLength = 10_000

const createMatcher = (query: string, options: PlateDocumentFindWorkerOptions) => {
  const boundedSource = options.wholeWord
    ? `(?<!${wordCharacter})(?:${query})(?!${wordCharacter})`
    : query
  try {
    return new RegExp(boundedSource, `gu${options.matchCase ? '' : 'i'}`)
  } catch {
    throw new Error('invalidRegex')
  }
}

const getPoint = (
  entries: PlateDocumentFindTextEntry[],
  target: number,
  preferNextEntry: boolean,
) => {
  let offset = 0
  for (const entry of entries) {
    const end = offset + entry.text.length
    if (target < end || (!preferNextEntry && target === end)) {
      return { offset: target - offset, path: entry.path }
    }
    offset = end
  }
  return null
}

const scanBlock = (
  block: PlateDocumentFindTextBlock,
  matcher: RegExp,
): PlateDocumentFindWorkerMatch[] => {
  const text = block.entries.map((entry) => entry.text).join('')
  const matches: PlateDocumentFindWorkerMatch[] = []
  matcher.lastIndex = 0
  for (const result of text.matchAll(matcher)) {
    if (!result[0] || result.index === undefined) continue
    const anchor = getPoint(block.entries, result.index, true)
    const focus = getPoint(block.entries, result.index + result[0].length, false)
    if (!anchor || !focus) continue
    matches.push({
      anchor,
      focus,
      regex: {
        captures: result.slice(1),
        groups: { ...result.groups },
        match: result[0],
        prefix: text.slice(0, result.index),
        suffix: text.slice(result.index + result[0].length),
      },
    })
  }
  return matches
}

export const scanPlateDocumentFindSource = (
  source: PlateDocumentFindTextBlock[],
  query: string,
  options: PlateDocumentFindWorkerOptions,
) => {
  if (!query) return []
  if (query.length > maxPatternLength) throw new Error('patternTooLong')
  const matcher = createMatcher(query, options)
  return source.flatMap((block) => scanBlock(block, matcher))
}
