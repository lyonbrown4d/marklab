import {
  DocumentCompletionBlockState,
  type DocumentCompletionBlock,
  type DocumentCompletionBlockOperation,
} from '@/logic/documentCompletionBlockState'
import { normalizeCompletionSection } from '@/logic/documentCompletionEntryExtractor'
import {
  rankCompletionCandidates,
  type DocumentCompletionCandidate,
} from '@/logic/documentCompletionQuery'
import { CompletionSearchIndex } from '@/logic/documentCompletionSearchIndex'
import {
  completionTrailingPrefix,
  documentCompletionTokenizer,
  normalizeCompletionSearchKey,
  type DocumentCompletionTokenizer,
} from '@/logic/documentCompletionTokenizer'

const DEFAULT_MAX_ENTRIES = 800
const DEFAULT_MAX_CONTEXT_LENGTH = 160_000
const DEFAULT_MAX_CANDIDATE_LENGTH = 96
const DEFAULT_MAX_CANDIDATES = 3
const DEFAULT_REBUILD_DELAY_MS = 180

export type {
  DocumentCompletionBlock,
  DocumentCompletionBlockKind,
  DocumentCompletionBlockOperation,
} from '@/logic/documentCompletionBlockState'
export type { DocumentCompletionCandidate } from '@/logic/documentCompletionQuery'

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

type ResolvedOptions = Required<Omit<DocumentCompletionIndexOptions, 'tokenizer'>>

export class DocumentCompletionIndex {
  private readonly blocks: DocumentCompletionBlockState
  private readonly options: ResolvedOptions
  private readonly searches = new CompletionSearchIndex()
  private latestVersion = -1
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: DocumentCompletionIndexOptions = {}) {
    this.options = {
      maxCandidateLength: options.maxCandidateLength ?? DEFAULT_MAX_CANDIDATE_LENGTH,
      maxCandidates: options.maxCandidates ?? DEFAULT_MAX_CANDIDATES,
      maxContextLength: options.maxContextLength ?? DEFAULT_MAX_CONTEXT_LENGTH,
      maxEntries: options.maxEntries ?? DEFAULT_MAX_ENTRIES,
      rebuildDelayMs: options.rebuildDelayMs ?? DEFAULT_REBUILD_DELAY_MS,
    }
    this.blocks = new DocumentCompletionBlockState(
      options.tokenizer ?? documentCompletionTokenizer,
      this.options.maxContextLength,
      this.options.maxEntries,
    )
  }

  get size() {
    return this.blocks.entries.length
  }

  resolveBlockOffset(blockId: string, blockOffset?: number) {
    return this.blocks.resolveBlockOffset(blockId, blockOffset)
  }

  rebuild(markdown: string, version = this.latestVersion + 1) {
    return this.replaceBlocks([{ id: '__document__', text: markdown }], version)
  }

  replaceBlocks(blocks: readonly DocumentCompletionBlock[], version = this.latestVersion + 1) {
    if (version < this.latestVersion) return false
    this.latestVersion = version
    const update = this.blocks.replace(blocks)
    this.searches.rebuild(update.entries)
    return true
  }

  applyBlockBatch(
    operations: readonly DocumentCompletionBlockOperation[],
    version = this.latestVersion + 1,
  ) {
    if (version < this.latestVersion) return false
    this.latestVersion = version
    const update = this.blocks.apply(operations)
    if (update.incremental) this.searches.update(update.entries)
    else this.searches.rebuild(update.entries)
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
    const prefix = completionTrailingPrefix(contextBefore)
    if (prefix.length < 2 || this.blocks.entries.length === 0) return []
    const resolvedCursor =
      cursorOffset ??
      (scope.blockId === undefined
        ? undefined
        : this.blocks.resolveBlockOffset(scope.blockId, scope.blockOffset))
    const localCursor =
      resolvedCursor === undefined
        ? undefined
        : Math.max(0, Math.min(this.blocks.sourceLength, resolvedCursor - this.blocks.sourceStart))
    const explicitSection = Object.hasOwn(scope, 'heading')
    const section = explicitSection
      ? normalizeCompletionSection(scope.heading)
      : localCursor === undefined
        ? null
        : this.blocks.sectionAt(this.blocks.sourceStart + localCursor)
    const results = this.searches.search(
      normalizeCompletionSearchKey(prefix),
      explicitSection || localCursor !== undefined,
      section,
    )
    return rankCompletionCandidates({
      cursor: localCursor ?? this.blocks.sourceLength,
      maxCandidateLength: this.options.maxCandidateLength,
      maxCandidates: this.options.maxCandidates,
      positionOf: (entry) => this.blocks.entryPosition(entry),
      prefix,
      results,
      sourceLength: this.blocks.sourceLength,
    })
  }

  destroy() {
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer)
    this.rebuildTimer = null
    this.blocks.clear()
    this.searches.clear()
  }
}
