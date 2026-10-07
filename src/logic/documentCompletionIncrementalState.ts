import type { CompletionEntryDraft } from '@/logic/documentCompletionEntryExtractor'

export type CompletionIndexedEntry = CompletionEntryDraft & {
  aggregateKey: string
  blockId: string
  localPosition: number
}

export const completionEntryKey = (entry: Pick<CompletionEntryDraft, 'section' | 'text'>) =>
  `${entry.section ?? ''}\u0000${entry.text.normalize('NFKC').toLowerCase()}`

export class CompletionBlockOffsets {
  private lengths: number[] = []
  private tree: number[] = [0]

  get count() {
    return this.lengths.length
  }

  get totalLength() {
    return Math.max(0, this.prefix(this.count) - (this.count > 0 ? 1 : 0))
  }

  reset(lengths: readonly number[]) {
    this.lengths = [...lengths]
    this.tree = Array.from({ length: lengths.length + 1 }, () => 0)
    lengths.forEach((length, index) => this.add(index, length + 1))
  }

  update(index: number, length: number) {
    const previous = this.lengths[index]
    if (previous === undefined || previous === length) return
    this.lengths[index] = length
    this.add(index, length - previous)
  }

  start(index: number) {
    return this.prefix(Math.max(0, Math.min(index, this.count)))
  }

  indexAt(offset: number) {
    if (this.count === 0) return undefined
    let low = 0
    let high = this.count - 1
    let result = 0
    while (low <= high) {
      const middle = Math.floor((low + high) / 2)
      if (this.start(middle) <= offset) {
        result = middle
        low = middle + 1
      } else high = middle - 1
    }
    return result
  }

  clear() {
    this.lengths = []
    this.tree = [0]
  }

  private add(index: number, delta: number) {
    for (let item = index + 1; item < this.tree.length; item += item & -item) {
      this.tree[item] = (this.tree[item] ?? 0) + delta
    }
  }

  private prefix(end: number) {
    let total = 0
    for (let item = end; item > 0; item -= item & -item) total += this.tree[item] ?? 0
    return total
  }
}

type Contribution = CompletionEntryDraft & { blockId: string }

export class CompletionEntryAggregate {
  private readonly orderOf: (blockId: string) => number
  private readonly byBlock = new Map<string, Map<string, Contribution>>()
  private readonly byKey = new Map<string, Map<string, Contribution>>()
  private readonly entries = new Map<string, CompletionIndexedEntry>()

  constructor(orderOf: (blockId: string) => number) {
    this.orderOf = orderOf
  }

  get(key: string) {
    return this.entries.get(key)
  }

  setBlock(blockId: string, drafts: readonly CompletionEntryDraft[]) {
    const changed = new Set<string>()
    const previous = this.byBlock.get(blockId)
    if (previous) {
      for (const key of previous.keys()) {
        changed.add(key)
        const contributions = this.byKey.get(key)
        contributions?.delete(blockId)
        if (contributions?.size === 0) this.byKey.delete(key)
      }
    }

    const next = new Map<string, Contribution>()
    for (const draft of drafts) {
      const key = completionEntryKey(draft)
      const contribution = { ...draft, blockId }
      next.set(key, contribution)
      changed.add(key)
      const contributions = this.byKey.get(key) ?? new Map<string, Contribution>()
      contributions.set(blockId, contribution)
      this.byKey.set(key, contributions)
    }
    if (next.size > 0) this.byBlock.set(blockId, next)
    else this.byBlock.delete(blockId)

    for (const key of changed) this.recompute(key)
  }

  clear() {
    this.byBlock.clear()
    this.byKey.clear()
    this.entries.clear()
  }

  private recompute(key: string) {
    const contributions = this.byKey.get(key)
    if (!contributions || contributions.size === 0) {
      this.entries.delete(key)
      return
    }
    const items = [...contributions.values()]
    let latest = items[0]
    if (!latest) return
    let frequency = 0
    let weight = 0
    const searchKeys = new Set<string>()
    for (const item of items) {
      frequency += item.frequency
      weight = Math.max(weight, item.weight)
      item.searchKeys.forEach((searchKey) => searchKeys.add(searchKey))
      const itemOrder = this.orderOf(item.blockId)
      const latestOrder = this.orderOf(latest.blockId)
      if (
        itemOrder > latestOrder ||
        (itemOrder === latestOrder && item.position > latest.position)
      ) {
        latest = item
      }
    }
    this.entries.set(key, {
      aggregateKey: key,
      blockId: latest.blockId,
      frequency,
      localPosition: latest.position,
      position: latest.position,
      searchKeys: [...searchKeys],
      section: latest.section,
      text: latest.text,
      weight,
    })
  }
}
