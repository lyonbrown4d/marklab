import Fuse from 'fuse.js'
import type {
  DocumentCompletionAnalysis,
  DocumentCompletionTokenizer,
} from '@/logic/documentCompletionTokenizer'

export type CompletionEntryDraft = {
  frequency: number
  position: number
  searchKeys: string[]
  section: string | null
  text: string
  weight: number
}

export type CompletionSectionBoundary = {
  section: string | null
  start: number
}

export type CompletionExtractionState = {
  fenced: boolean
  section: string | null
}

export type CompletionBlockExtraction = {
  entries: CompletionEntryDraft[]
  sections: CompletionSectionBoundary[]
  state: CompletionExtractionState
}

export type CompletionExtractionCache = CompletionExtractionState & {
  result: CompletionBlockExtraction
}

export type CompletionBlockKind = 'heading' | 'ignored' | 'list-item' | 'text'

export const completionFuseOptions = {
  ignoreLocation: true,
  includeScore: true,
  keys: ['text', 'searchKeys'],
  minMatchCharLength: 2,
  threshold: 0.32,
}

export const createCompletionSearches = (entries: CompletionEntryDraft[]) => {
  const grouped = new Map<string | null, CompletionEntryDraft[]>()
  for (const entry of entries) {
    grouped.set(entry.section, [...(grouped.get(entry.section) ?? []), entry])
  }
  return {
    fuse: new Fuse(entries, completionFuseOptions),
    sections: new Map(
      [...grouped].map(([section, sectionEntries]) => [
        section,
        new Fuse(sectionEntries, completionFuseOptions),
      ]),
    ),
  }
}

export const cleanCompletionMarkdownText = (text: string) =>
  text
    .replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .trim()

export const normalizeCompletionSection = (heading: string | null | undefined) => {
  const normalized = heading
    ? cleanCompletionMarkdownText(heading).normalize('NFKC').toLowerCase()
    : ''
  return normalized || null
}

const graphemeSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null

export const exactCompletionContinuation = (text: string, prefix: string) => {
  let normalized = ''
  const ends: number[] = []
  const graphemes = graphemeSegmenter
    ? [...graphemeSegmenter.segment(text)].map(({ index, segment }) => ({ index, segment }))
    : Array.from(text, (segment, index) => ({ index, segment }))
  let fallbackOffset = 0
  for (const grapheme of graphemes) {
    const sourceOffset = graphemeSegmenter ? grapheme.index : fallbackOffset
    const piece = grapheme.segment.normalize('NFKC').toLowerCase()
    for (let offset = 0; offset < piece.length; offset += 1) {
      ends.push(sourceOffset + grapheme.segment.length)
    }
    normalized += piece
    fallbackOffset += grapheme.segment.length
  }
  const normalizedPrefix = prefix.normalize('NFKC').toLowerCase()
  const index = normalized.indexOf(normalizedPrefix)
  if (index < 0 || normalizedPrefix.length === 0) return null
  const rawEnd = ends[index + normalizedPrefix.length - 1]
  if (rawEnd === undefined) return null
  return { exactRank: index === 0 ? 0 : 1, text: text.slice(rawEnd) }
}

const addEntry = (
  entries: Map<string, CompletionEntryDraft>,
  analysis: DocumentCompletionAnalysis,
  rawText: string,
  weight: number,
  position: number,
  section: string | null,
) => {
  const text = cleanCompletionMarkdownText(rawText)
  if (text.length < 3) return
  const normalized = text.normalize('NFKC').toLowerCase()
  const key = `${section ?? ''}\u0000${normalized}`
  const existing = entries.get(key)
  if (existing) {
    existing.frequency += 1
    existing.position = Math.max(existing.position, position)
    existing.weight = Math.max(existing.weight, weight)
    return
  }
  const searchKeys = analysis.tokens
    .filter((token) => token.start >= position && token.end <= position + rawText.length)
    .map(({ normalized: token }) => token)
  entries.set(key, {
    frequency: 1,
    position,
    searchKeys: [...new Set([normalized, ...searchKeys])],
    section,
    text,
    weight,
  })
}

export const extractCompletionBlock = (
  text: string,
  analysis: DocumentCompletionAnalysis,
  initialState: CompletionExtractionState,
  kind: CompletionBlockKind = 'text',
): CompletionBlockExtraction => {
  const entries = new Map<string, CompletionEntryDraft>()
  const sections: CompletionSectionBoundary[] = []
  const state = { ...initialState }
  let lineStart = 0

  if (kind === 'ignored') return { entries: [], sections, state }
  if (kind === 'heading') {
    state.section = normalizeCompletionSection(text)
    sections.push({ section: state.section, start: 0 })
    addEntry(entries, analysis, text, 5, 0, state.section)
    return { entries: [...entries.values()], sections, state }
  }

  for (const line of text.split(/\r?\n/u)) {
    const lineEnd = lineStart + line.length
    const newlineWidth = text.startsWith('\r\n', lineEnd) ? 2 : lineEnd < text.length ? 1 : 0
    const nextLineStart = lineEnd + newlineWidth
    if (/^\s*```/u.test(line)) {
      state.fenced = !state.fenced
      lineStart = nextLineStart
      continue
    }
    if (state.fenced || !line.trim()) {
      lineStart = nextLineStart
      continue
    }

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/u)
    const listItem = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/u)
    const body = heading?.[1] ?? listItem?.[1] ?? line
    const bodyOffset = line.indexOf(body)
    if (heading?.[1]) {
      state.section = normalizeCompletionSection(heading[1])
      sections.push({ section: state.section, start: lineStart })
    }
    const weight = kind === 'list-item' || listItem ? 6 : heading ? 5 : 2
    addEntry(entries, analysis, body, weight, lineStart, state.section)

    const bodyStart = lineStart + Math.max(0, bodyOffset)
    const bodyEnd = bodyStart + body.length
    for (const sentence of analysis.sentences) {
      if (sentence.end <= bodyStart || sentence.start >= bodyEnd) continue
      const start = Math.max(sentence.start, bodyStart)
      const end = Math.min(sentence.end, bodyEnd)
      addEntry(entries, analysis, text.slice(start, end), 3, start, state.section)
    }
    for (const match of line.matchAll(/\[([^\]]+)\]\([^)]*\)/g)) {
      addEntry(entries, analysis, match[1] ?? '', 4, lineStart, state.section)
    }
    for (const match of line.matchAll(/(?:^|\s)(#[\p{L}\p{N}_-]+)/gu)) {
      addEntry(entries, analysis, match[1] ?? '', 4, lineStart, state.section)
    }
    lineStart = nextLineStart
  }

  return { entries: [...entries.values()], sections, state }
}

export const analyzeCompletionBlock = (tokenizer: DocumentCompletionTokenizer, text: string) =>
  tokenizer.analyze(text)

export const extractCompletionBlockCached = (
  text: string,
  analysis: DocumentCompletionAnalysis,
  state: CompletionExtractionState,
  kind: CompletionBlockKind | undefined,
  cache?: CompletionExtractionCache,
) => {
  if (cache?.fenced === state.fenced && cache.section === state.section) {
    return cache
  }
  const result = extractCompletionBlock(text, analysis, state, kind)
  return { fenced: state.fenced, result, section: state.section }
}

export const completionSectionAt = (
  sections: readonly CompletionSectionBoundary[],
  cursor: number,
) => {
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const boundary = sections[index]
    if (boundary && boundary.start <= cursor) return boundary.section
  }
  return null
}
