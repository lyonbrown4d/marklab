import Fuse from 'fuse.js'

const DEFAULT_MAX_ENTRIES = 800
const DEFAULT_MAX_CONTEXT_LENGTH = 160_000
const DEFAULT_MAX_CANDIDATE_LENGTH = 96
const DEFAULT_MAX_CANDIDATES = 3
const DEFAULT_REBUILD_DELAY_MS = 180
const MAX_PREFIX_LENGTH = 80

export type DocumentCompletionCandidate = {
  score: number
  source: 'document'
  text: string
}

export type DocumentCompletionIndexOptions = {
  maxCandidateLength?: number
  maxCandidates?: number
  maxContextLength?: number
  maxEntries?: number
  rebuildDelayMs?: number
}

export type DocumentCompletionScope = {
  heading?: string | null
}

type CompletionEntry = {
  frequency: number
  position: number
  section: string | null
  text: string
  weight: number
}

type SectionBoundary = {
  section: string | null
  start: number
}

type RankedCandidate = DocumentCompletionCandidate & {
  dedupeKey: string
}

const normalizeCandidateKey = (text: string) =>
  text
    .trim()
    .toLocaleLowerCase()
    .replace(/[.!?。！？;,，；:：]+$/u, '')

const cleanMarkdownText = (text: string) =>
  text
    .replace(/!?(?:\[([^\]]+)\])\([^)]*\)/g, '$1')
    .replace(/[*_~`]+/g, '')
    .trim()

const normalizeSection = (heading: string | null | undefined) => {
  const normalized = heading ? cleanMarkdownText(heading).toLocaleLowerCase() : ''
  return normalized || null
}

const sentenceSegmenter =
  typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
    : null

const sentences = (text: string) =>
  sentenceSegmenter
    ? [...sentenceSegmenter.segment(text)].map(({ segment }) => segment)
    : (text.match(/[^.!?。！？]+[.!?。！？]?/gu) ?? [])

const extractEntries = (
  markdown: string,
  maximum: number,
): { entries: CompletionEntry[]; sections: SectionBoundary[] } => {
  const entries = new Map<string, CompletionEntry>()
  const sections: SectionBoundary[] = [{ section: null, start: 0 }]
  let fenced = false
  let position = 0
  let section: string | null = null

  const add = (rawText: string, weight: number, entryPosition: number) => {
    const text = cleanMarkdownText(rawText)
    if (text.length < 3) return
    const key = `${section ?? ''}\u0000${text.toLocaleLowerCase()}`
    const existing = entries.get(key)
    if (existing) {
      existing.frequency += 1
      existing.position = Math.max(existing.position, entryPosition)
      existing.weight = Math.max(existing.weight, weight)
      return
    }
    if (entries.size < maximum) {
      entries.set(key, { frequency: 1, position: entryPosition, section, text, weight })
    }
  }

  for (const line of markdown.split(/\r?\n/)) {
    const linePosition = position
    position += line.length + 1
    if (/^\s*```/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced || !line.trim()) continue

    const heading = line.match(/^\s{0,3}#{1,6}\s+(.+)$/)
    const listItem = line.match(/^\s*(?:[-+*]|\d+[.)])\s+(.+)$/)
    if (heading?.[1]) {
      section = normalizeSection(heading[1])
      sections.push({ section, start: linePosition })
    }
    const body = heading?.[1] ?? listItem?.[1] ?? line
    add(body, listItem ? 6 : heading ? 5 : 2, linePosition)

    for (const sentence of sentences(body)) {
      add(sentence, 3, linePosition)
    }
    for (const match of line.matchAll(/\[([^\]]+)\]\([^)]*\)/g))
      add(match[1] ?? '', 4, linePosition)
    for (const match of line.matchAll(/(?:^|\s)(#[\p{L}\p{N}_-]+)/gu))
      add(match[1] ?? '', 4, linePosition)
  }

  return { entries: [...entries.values()], sections }
}

const trailingPrefix = (context: string) => {
  const tail = context.slice(-MAX_PREFIX_LENGTH * 2)
  const segment =
    tail
      .split(/[\n.!?。！？]/u)
      .at(-1)
      ?.trimStart() ?? ''
  return segment.slice(-MAX_PREFIX_LENGTH).trimEnd()
}

const exactContinuation = (entry: CompletionEntry, prefix: string) => {
  const index = entry.text.toLocaleLowerCase().indexOf(prefix.toLocaleLowerCase())
  if (index < 0) return null
  return {
    exactRank: index === 0 ? 0 : 1,
    text: entry.text.slice(index + prefix.length),
  }
}

const sectionAt = (sections: readonly SectionBoundary[], cursor: number) => {
  for (let index = sections.length - 1; index >= 0; index -= 1) {
    const boundary = sections[index]
    if (boundary && boundary.start <= cursor) return boundary.section
  }
  return null
}

export class DocumentCompletionIndex {
  private readonly options: Required<DocumentCompletionIndexOptions>
  private entries: CompletionEntry[] = []
  private fuse = new Fuse<CompletionEntry>([], { keys: ['text'] })
  private sectionFuses = new Map<string | null, Fuse<CompletionEntry>>()
  private sections: SectionBoundary[] = []
  private latestVersion = -1
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null
  private sourceLength = 0
  private sourceStartOffset = 0

  constructor(options: DocumentCompletionIndexOptions = {}) {
    this.options = {
      maxCandidateLength: options.maxCandidateLength ?? DEFAULT_MAX_CANDIDATE_LENGTH,
      maxCandidates: options.maxCandidates ?? DEFAULT_MAX_CANDIDATES,
      maxContextLength: options.maxContextLength ?? DEFAULT_MAX_CONTEXT_LENGTH,
      maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
      rebuildDelayMs: options.rebuildDelayMs ?? DEFAULT_REBUILD_DELAY_MS,
    }
  }

  get size() {
    return this.entries.length
  }

  rebuild(markdown: string, version = this.latestVersion + 1) {
    if (version < this.latestVersion) return false
    this.latestVersion = version
    const bounded = markdown.slice(-this.options.maxContextLength)
    this.sourceStartOffset = markdown.length - bounded.length
    this.sourceLength = bounded.length
    const extracted = extractEntries(bounded, this.options.maxEntries)
    this.entries = extracted.entries
    this.sections = extracted.sections
    const fuseOptions = {
      ignoreLocation: true,
      includeScore: true,
      keys: ['text'],
      minMatchCharLength: 2,
      threshold: 0.32,
    }
    this.fuse = new Fuse(this.entries, fuseOptions)
    this.sectionFuses = new Map()
    const grouped = new Map<string | null, CompletionEntry[]>()
    for (const entry of this.entries) {
      const group = grouped.get(entry.section) ?? []
      group.push(entry)
      grouped.set(entry.section, group)
    }
    for (const [section, entries] of grouped) {
      this.sectionFuses.set(section, new Fuse(entries, fuseOptions))
    }
    return true
  }

  scheduleRebuild(markdown: string, version = this.latestVersion + 1) {
    if (version < this.latestVersion) return
    this.latestVersion = version
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = null
      this.rebuild(markdown, version)
    }, this.options.rebuildDelayMs)
  }

  query(
    contextBefore: string,
    cursorOffset?: number,
    scope: DocumentCompletionScope = {},
  ): DocumentCompletionCandidate[] {
    const prefix = trailingPrefix(contextBefore)
    if (prefix.length < 2 || this.entries.length === 0) return []

    const ranked = new Map<string, RankedCandidate>()
    const explicitSection = Object.hasOwn(scope, 'heading')
    const localCursor =
      cursorOffset === undefined
        ? undefined
        : Math.max(0, Math.min(this.sourceLength, cursorOffset - this.sourceStartOffset))
    const inferredSection = localCursor === undefined ? null : sectionAt(this.sections, localCursor)
    const section = explicitSection ? normalizeSection(scope.heading) : inferredSection
    const sectionScoped = explicitSection || localCursor !== undefined
    const search = sectionScoped ? this.sectionFuses.get(section) : this.fuse
    if (!search) return []
    const results = search.search(prefix, { limit: Math.min(search.getIndex().size(), 80) })
    for (const result of results) {
      if (sectionScoped && result.item.section !== section) continue
      const exact = exactContinuation(result.item, prefix)
      if (!exact) continue
      const text = exact.text.slice(0, this.options.maxCandidateLength)
      const dedupeKey = normalizeCandidateKey(text)
      if (!dedupeKey || text.trim().length < 1) continue

      const proximity = Math.min(
        1,
        Math.abs((localCursor ?? this.sourceLength) - result.item.position) /
          Math.max(1, this.sourceLength),
      )
      const score =
        exact.exactRank * 10 -
        result.item.weight * 2 -
        Math.min(result.item.frequency, 5) * 1.5 +
        proximity
      const candidate: RankedCandidate = { dedupeKey, score, source: 'document', text }
      const existing = ranked.get(dedupeKey)
      if (!existing || candidate.score < existing.score) ranked.set(dedupeKey, candidate)
    }

    return [...ranked.values()]
      .sort((left, right) => left.score - right.score)
      .slice(0, this.options.maxCandidates)
      .map(({ score, source, text }) => ({ score, source, text }))
  }

  destroy() {
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
    this.rebuildTimer = null
    this.entries = []
    this.sections = []
    this.sectionFuses.clear()
    this.fuse.setCollection([])
  }
}
