import Fuse from 'fuse.js'
import {
  analyzeCompletionBlock,
  completionFuseOptions,
  completionSectionAt,
  createCompletionSearches,
  exactCompletionContinuation,
  extractCompletionBlockCached,
  normalizeCompletionSection,
  type CompletionEntryDraft,
  type CompletionExtractionCache,
  type CompletionSectionBoundary,
} from '@/logic/documentCompletionEntryExtractor'
import {
  completionTrailingPrefix,
  documentCompletionTokenizer,
  normalizeCompletionCandidateKey,
  normalizeCompletionSearchKey,
  type DocumentCompletionAnalysis,
  type DocumentCompletionTokenizer,
} from '@/logic/documentCompletionTokenizer'

const DEFAULT_MAX_ENTRIES = 800
const DEFAULT_MAX_CONTEXT_LENGTH = 160_000
const DEFAULT_MAX_CANDIDATE_LENGTH = 96
const DEFAULT_MAX_CANDIDATES = 3
const DEFAULT_REBUILD_DELAY_MS = 180

export type DocumentCompletionCandidate = { score: number; source: 'document'; text: string }
export type DocumentCompletionBlockKind = 'heading' | 'ignored' | 'list-item' | 'text'
export type DocumentCompletionBlock = {
  id: string
  kind?: DocumentCompletionBlockKind
  order?: number
  text: string
}
export type DocumentCompletionBlockOperation =
  { block: DocumentCompletionBlock; type: 'upsert' } | { id: string; type: 'remove' }
export type DocumentCompletionIndexOptions = {
  maxCandidateLength?: number
  maxCandidates?: number
  maxContextLength?: number
  maxEntries?: number
  rebuildDelayMs?: number
  tokenizer?: DocumentCompletionTokenizer
}
export type DocumentCompletionScope = {
  blockId?: string
  blockOffset?: number
  heading?: string | null
}

type CompletionEntry = CompletionEntryDraft
type StoredBlock = {
  analysis: DocumentCompletionAnalysis
  block: DocumentCompletionBlock
  extraction?: CompletionExtractionCache
  sequence: number
}
type RankedCandidate = DocumentCompletionCandidate & { dedupeKey: string }
type ResolvedOptions = Required<Omit<DocumentCompletionIndexOptions, 'tokenizer'>>

export class DocumentCompletionIndex {
  private readonly options: ResolvedOptions
  private readonly tokenizer: DocumentCompletionTokenizer
  private blocks: StoredBlock[] = []
  private entries: CompletionEntry[] = []
  private fuse = new Fuse<CompletionEntry>([], completionFuseOptions)
  private sectionFuses = new Map<string | null, Fuse<CompletionEntry>>()
  private sections: CompletionSectionBoundary[] = []
  private latestVersion = -1
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null
  private sourceLength = 0
  private sourceStartOffset = 0
  private nextSequence = 0

  constructor(options: DocumentCompletionIndexOptions = {}) {
    this.options = {
      maxCandidateLength: options.maxCandidateLength ?? DEFAULT_MAX_CANDIDATE_LENGTH,
      maxCandidates: options.maxCandidates ?? DEFAULT_MAX_CANDIDATES,
      maxContextLength: options.maxContextLength ?? DEFAULT_MAX_CONTEXT_LENGTH,
      maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
      rebuildDelayMs: options.rebuildDelayMs ?? DEFAULT_REBUILD_DELAY_MS,
    }
    this.tokenizer = options.tokenizer ?? documentCompletionTokenizer
  }

  get size() {
    return this.entries.length
  }

  resolveBlockOffset(blockId: string, blockOffset?: number) {
    let offset = 0
    for (const stored of this.blocks) {
      if (stored.block.id === blockId) {
        const local = Math.max(
          0,
          Math.min(stored.block.text.length, blockOffset ?? stored.block.text.length),
        )
        return offset + local
      }
      offset += stored.block.text.length + 1
    }
    return undefined
  }

  rebuild(markdown: string, version = this.latestVersion + 1) {
    return this.replaceBlocks([{ id: '__document__', text: markdown }], version)
  }

  replaceBlocks(blocks: readonly DocumentCompletionBlock[], version = this.latestVersion + 1) {
    if (version < this.latestVersion) return false
    this.latestVersion = version
    const previous = new Map(this.blocks.map((stored) => [stored.block.id, stored]))
    this.blocks = blocks.map((block) => {
      const existing = previous.get(block.id)
      const reusable = existing?.block.text === block.text && existing.block.kind === block.kind
      return {
        analysis: reusable ? existing.analysis : analyzeCompletionBlock(this.tokenizer, block.text),
        block: { ...block },
        extraction: reusable ? existing.extraction : undefined,
        sequence: existing?.sequence ?? this.nextSequence++,
      }
    })
    this.refresh()
    return true
  }

  applyBlockBatch(
    operations: readonly DocumentCompletionBlockOperation[],
    version = this.latestVersion + 1,
  ) {
    if (version < this.latestVersion) return false
    this.latestVersion = version
    const byId = new Map(this.blocks.map((stored) => [stored.block.id, stored]))
    for (const operation of operations) {
      if (operation.type === 'remove') {
        byId.delete(operation.id)
        continue
      }
      const existing = byId.get(operation.block.id)
      const reusable =
        existing?.block.text === operation.block.text &&
        existing.block.kind === operation.block.kind
      byId.set(operation.block.id, {
        analysis: reusable
          ? existing.analysis
          : analyzeCompletionBlock(this.tokenizer, operation.block.text),
        block: { ...operation.block },
        extraction: reusable ? existing.extraction : undefined,
        sequence: existing?.sequence ?? this.nextSequence++,
      })
    }
    this.blocks = [...byId.values()]
    this.refresh()
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

  private refresh() {
    this.blocks.sort(
      (left, right) =>
        (left.block.order ?? left.sequence) - (right.block.order ?? right.sequence) ||
        left.sequence - right.sequence,
    )
    const totalLength = this.blocks.reduce(
      (length, stored, index) => length + stored.block.text.length + (index === 0 ? 0 : 1),
      0,
    )
    this.sourceStartOffset = Math.max(0, totalLength - this.options.maxContextLength)
    this.sourceLength = totalLength - this.sourceStartOffset
    const aggregated = new Map<string, CompletionEntry>()
    const sections: CompletionSectionBoundary[] = [{ section: null, start: 0 }]
    let state = { fenced: false, section: null as string | null }
    let blockStart = 0
    for (const stored of this.blocks) {
      const extraction = extractCompletionBlockCached(
        stored.block.text,
        stored.analysis,
        state,
        stored.block.kind,
        stored.extraction,
      )
      stored.extraction = extraction
      const extracted = extraction.result
      state = extracted.state
      for (const boundary of extracted.sections) {
        sections.push({ section: boundary.section, start: blockStart + boundary.start })
      }
      for (const draft of extracted.entries) {
        const position = blockStart + draft.position - this.sourceStartOffset
        if (position < 0) continue
        const key = `${draft.section ?? ''}\u0000${draft.text.normalize('NFKC').toLowerCase()}`
        const existing = aggregated.get(key)
        if (existing) {
          existing.frequency += draft.frequency
          existing.position = Math.max(existing.position, position)
          existing.weight = Math.max(existing.weight, draft.weight)
          existing.searchKeys = [...new Set([...existing.searchKeys, ...draft.searchKeys])]
        } else aggregated.set(key, { ...draft, position })
      }
      blockStart += stored.block.text.length + 1
    }
    const inheritedSection = completionSectionAt(sections, this.sourceStartOffset)
    this.sections = sections
      .map((boundary) => ({ ...boundary, start: boundary.start - this.sourceStartOffset }))
      .filter(({ start }) => start >= 0)
    if (this.sections[0]?.start !== 0) {
      this.sections.unshift({ section: inheritedSection, start: 0 })
    }
    this.entries = [...aggregated.values()]
      .sort((left, right) => right.position - left.position || right.weight - left.weight)
      .slice(0, this.options.maxEntries)
    const searches = createCompletionSearches(this.entries)
    this.fuse = searches.fuse
    this.sectionFuses = searches.sections
  }

  query(
    contextBefore: string,
    cursorOffset?: number,
    scope: DocumentCompletionScope = {},
  ): DocumentCompletionCandidate[] {
    const prefix = completionTrailingPrefix(contextBefore)
    if (prefix.length < 2 || this.entries.length === 0) return []
    const ranked = new Map<string, RankedCandidate>()
    const resolvedCursor =
      cursorOffset ??
      (scope.blockId === undefined
        ? undefined
        : this.resolveBlockOffset(scope.blockId, scope.blockOffset))
    const localCursor =
      resolvedCursor === undefined
        ? undefined
        : Math.max(0, Math.min(this.sourceLength, resolvedCursor - this.sourceStartOffset))
    const explicitSection = Object.hasOwn(scope, 'heading')
    const section = explicitSection
      ? normalizeCompletionSection(scope.heading)
      : localCursor === undefined
        ? null
        : completionSectionAt(this.sections, localCursor)
    const sectionScoped = explicitSection || localCursor !== undefined
    const search = sectionScoped ? this.sectionFuses.get(section) : this.fuse
    if (!search) return []
    const results = search.search(normalizeCompletionSearchKey(prefix), {
      limit: Math.min(search.getIndex().size(), 80),
    })
    for (const result of results) {
      const exact = exactCompletionContinuation(result.item.text, prefix)
      if (!exact) continue
      const text = exact.text.slice(0, this.options.maxCandidateLength)
      const dedupeKey = normalizeCompletionCandidateKey(text)
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
    this.blocks = []
    this.entries = []
    this.sections = []
    this.sectionFuses.clear()
    this.fuse.setCollection([])
  }
}
