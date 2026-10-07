import {
  analyzeCompletionBlock,
  completionSectionAt,
  extractCompletionBlockCached,
  type CompletionExtractionCache,
} from '@/logic/documentCompletionEntryExtractor'
import {
  CompletionBlockOffsets,
  CompletionEntryAggregate,
  completionEntryKey,
  type CompletionIndexedEntry,
} from '@/logic/documentCompletionIncrementalState'
import type {
  DocumentCompletionAnalysis,
  DocumentCompletionTokenizer,
} from '@/logic/documentCompletionTokenizer'

export type DocumentCompletionBlockKind = 'heading' | 'ignored' | 'list-item' | 'text'
export type DocumentCompletionBlock = {
  id: string
  kind?: DocumentCompletionBlockKind
  order?: number
  text: string
}
export type DocumentCompletionBlockOperation =
  { block: DocumentCompletionBlock; type: 'upsert' } | { id: string; type: 'remove' }

type StoredBlock = {
  analysis: DocumentCompletionAnalysis
  block: DocumentCompletionBlock
  extraction?: CompletionExtractionCache
  sequence: number
}

export type CompletionBlockStateUpdate = {
  entries: readonly CompletionIndexedEntry[]
  incremental: boolean
}

export class DocumentCompletionBlockState {
  private readonly aggregates: CompletionEntryAggregate
  private readonly maxContextLength: number
  private readonly maxEntries: number
  private readonly offsets = new CompletionBlockOffsets()
  private readonly tokenizer: DocumentCompletionTokenizer
  private blockIndices = new Map<string, number>()
  private blocks: StoredBlock[] = []
  private currentEntries: CompletionIndexedEntry[] = []
  private nextSequence = 0
  private sourceStartOffset = 0

  constructor(
    tokenizer: DocumentCompletionTokenizer,
    maxContextLength: number,
    maxEntries: number,
  ) {
    this.tokenizer = tokenizer
    this.maxContextLength = maxContextLength
    this.maxEntries = maxEntries
    this.aggregates = new CompletionEntryAggregate(
      (blockId) => this.blockIndices.get(blockId) ?? -1,
    )
  }

  get entries() {
    return this.currentEntries
  }

  get sourceLength() {
    return this.offsets.totalLength - this.sourceStartOffset
  }

  get sourceStart() {
    return this.sourceStartOffset
  }

  replace(blocks: readonly DocumentCompletionBlock[]): CompletionBlockStateUpdate {
    const previous = new Map(this.blocks.map((stored) => [stored.block.id, stored]))
    this.blocks = blocks.map((block) => this.createStoredBlock(block, previous.get(block.id)))
    this.fullRefresh()
    return { entries: this.currentEntries, incremental: false }
  }

  apply(operations: readonly DocumentCompletionBlockOperation[]): CompletionBlockStateUpdate {
    if (this.canUpdateIncrementally(operations)) {
      this.applyStableUpserts(operations)
      return { entries: this.currentEntries, incremental: true }
    }
    const byId = new Map(this.blocks.map((stored) => [stored.block.id, stored]))
    for (const operation of operations) {
      if (operation.type === 'remove') byId.delete(operation.id)
      else {
        byId.set(
          operation.block.id,
          this.createStoredBlock(operation.block, byId.get(operation.block.id)),
        )
      }
    }
    this.blocks = [...byId.values()]
    this.fullRefresh()
    return { entries: this.currentEntries, incremental: false }
  }

  resolveBlockOffset(blockId: string, blockOffset?: number) {
    const index = this.blockIndices.get(blockId)
    const stored = index === undefined ? undefined : this.blocks[index]
    if (!stored || index === undefined) return undefined
    const local = Math.max(
      0,
      Math.min(stored.block.text.length, blockOffset ?? stored.block.text.length),
    )
    return this.offsets.start(index) + local
  }

  entryPosition(entry: CompletionIndexedEntry) {
    const index = this.blockIndices.get(entry.blockId)
    return index === undefined
      ? entry.localPosition
      : this.offsets.start(index) + entry.localPosition - this.sourceStartOffset
  }

  sectionAt(documentOffset: number) {
    const index = this.offsets.indexAt(documentOffset)
    const stored = index === undefined ? undefined : this.blocks[index]
    if (!stored?.extraction || index === undefined) return null
    const localOffset = documentOffset - this.offsets.start(index)
    return completionSectionAt(
      [{ section: stored.extraction.section, start: 0 }, ...stored.extraction.result.sections],
      localOffset,
    )
  }

  clear() {
    this.blocks = []
    this.blockIndices.clear()
    this.currentEntries = []
    this.offsets.clear()
    this.aggregates.clear()
  }

  private createStoredBlock(block: DocumentCompletionBlock, existing?: StoredBlock): StoredBlock {
    const reusable = existing?.block.text === block.text && existing.block.kind === block.kind
    return {
      analysis: reusable ? existing.analysis : analyzeCompletionBlock(this.tokenizer, block.text),
      block: { ...block },
      extraction: reusable ? existing.extraction : undefined,
      sequence: existing?.sequence ?? this.nextSequence++,
    }
  }

  private canUpdateIncrementally(
    operations: readonly DocumentCompletionBlockOperation[],
  ): operations is readonly { block: DocumentCompletionBlock; type: 'upsert' }[] {
    return operations.every((operation) => {
      if (operation.type !== 'upsert') return false
      const index = this.blockIndices.get(operation.block.id)
      const existing = index === undefined ? undefined : this.blocks[index]
      return !!existing && existing.block.order === operation.block.order
    })
  }

  private fullRefresh() {
    this.blocks.sort(
      (left, right) =>
        (left.block.order ?? left.sequence) - (right.block.order ?? right.sequence) ||
        left.sequence - right.sequence,
    )
    this.blockIndices = new Map(this.blocks.map((stored, index) => [stored.block.id, index]))
    this.offsets.reset(this.blocks.map(({ block }) => block.text.length))
    this.updateSourceRange()
    this.aggregates.clear()
    let state = { fenced: false, section: null as string | null }
    this.blocks.forEach((stored, index) => {
      stored.extraction = extractCompletionBlockCached(
        stored.block.text,
        stored.analysis,
        state,
        stored.block.kind,
        stored.extraction,
      )
      state = stored.extraction.result.state
      this.updateAggregateBlock(index)
    })
    this.currentEntries = this.selectEntries()
  }

  private applyStableUpserts(
    operations: readonly { block: DocumentCompletionBlock; type: 'upsert' }[],
  ) {
    const oldBoundary =
      this.sourceStartOffset > 0 ? this.offsets.indexAt(this.sourceStartOffset) : undefined
    const changed = new Set<number>()
    for (const { block } of operations) {
      const index = this.blockIndices.get(block.id)
      const stored = index === undefined ? undefined : this.blocks[index]
      if (!stored || index === undefined) continue
      const reusable = stored.block.text === block.text && stored.block.kind === block.kind
      stored.block = { ...block }
      if (reusable) continue
      stored.analysis = analyzeCompletionBlock(this.tokenizer, block.text)
      stored.extraction = undefined
      this.offsets.update(index, block.text.length)
      changed.add(index)
    }
    if (changed.size === 0) return
    const affected = this.reextractChangedRange(changed)
    this.updateSourceRange()
    const newBoundary =
      this.sourceStartOffset > 0 ? this.offsets.indexAt(this.sourceStartOffset) : undefined
    this.addBoundaryRange(affected, oldBoundary, newBoundary)
    affected.forEach((index) => this.updateAggregateBlock(index))
    this.currentEntries = this.selectEntries()
  }

  private reextractChangedRange(changed: ReadonlySet<number>) {
    const affected = new Set<number>()
    const first = Math.min(...changed)
    const last = Math.max(...changed)
    let state = this.blocks[first - 1]?.extraction?.result.state ?? {
      fenced: false,
      section: null,
    }
    for (let index = first; index < this.blocks.length; index += 1) {
      const stored = this.blocks[index]
      if (!stored) continue
      const previous = stored.extraction
      const extraction = extractCompletionBlockCached(
        stored.block.text,
        stored.analysis,
        state,
        stored.block.kind,
        previous,
      )
      stored.extraction = extraction
      state = extraction.result.state
      if (extraction !== previous) affected.add(index)
      if (index >= last && extraction === previous) break
    }
    return affected
  }

  private addBoundaryRange(
    affected: Set<number>,
    oldBoundary: number | undefined,
    newBoundary: number | undefined,
  ) {
    if (oldBoundary === undefined && newBoundary === undefined) return
    const first = Math.min(oldBoundary ?? newBoundary ?? 0, newBoundary ?? oldBoundary ?? 0)
    const last = Math.max(oldBoundary ?? newBoundary ?? 0, newBoundary ?? oldBoundary ?? 0)
    for (let index = first; index <= last; index += 1) affected.add(index)
  }

  private updateSourceRange() {
    this.sourceStartOffset = Math.max(0, this.offsets.totalLength - this.maxContextLength)
  }

  private updateAggregateBlock(index: number) {
    const stored = this.blocks[index]
    if (!stored?.extraction) return
    const blockStart = this.offsets.start(index)
    const drafts = stored.extraction.result.entries.filter(
      ({ position }) => blockStart + position >= this.sourceStartOffset,
    )
    this.aggregates.setBlock(stored.block.id, drafts)
  }

  private selectEntries() {
    const selected = new Map<string, CompletionIndexedEntry>()
    for (let index = this.blocks.length - 1; index >= 0; index -= 1) {
      const stored = this.blocks[index]
      if (!stored?.extraction) continue
      const blockStart = this.offsets.start(index)
      if (blockStart + stored.block.text.length < this.sourceStartOffset) break
      for (const draft of stored.extraction.result.entries) {
        if (blockStart + draft.position < this.sourceStartOffset) continue
        const entry = this.aggregates.get(completionEntryKey(draft))
        if (entry?.blockId === stored.block.id && entry.localPosition === draft.position) {
          selected.set(entry.aggregateKey, entry)
        }
      }
      if (selected.size >= this.maxEntries) break
    }
    return [...selected.values()]
      .sort(
        (left, right) =>
          this.entryPosition(right) - this.entryPosition(left) || right.weight - left.weight,
      )
      .slice(0, this.maxEntries)
  }
}
