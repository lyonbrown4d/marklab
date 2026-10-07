import Fuse from 'fuse.js'
import { completionFuseOptions } from '@/logic/documentCompletionEntryExtractor'
import type { CompletionIndexedEntry } from '@/logic/documentCompletionIncrementalState'

export class CompletionSearchIndex {
  private entries = new Map<string, CompletionIndexedEntry>()
  private fuse = new Fuse<CompletionIndexedEntry>([], completionFuseOptions)
  private sections = new Map<string | null, Fuse<CompletionIndexedEntry>>()

  rebuild(entries: readonly CompletionIndexedEntry[]) {
    this.entries = new Map(entries.map((entry) => [entry.aggregateKey, entry]))
    this.fuse = new Fuse([...entries], completionFuseOptions)
    const grouped = new Map<string | null, CompletionIndexedEntry[]>()
    for (const entry of entries) {
      const sectionEntries = grouped.get(entry.section) ?? []
      sectionEntries.push(entry)
      grouped.set(entry.section, sectionEntries)
    }
    this.sections = new Map(
      [...grouped].map(([section, sectionEntries]) => [
        section,
        new Fuse([...sectionEntries], completionFuseOptions),
      ]),
    )
  }

  update(entries: readonly CompletionIndexedEntry[]) {
    const next = new Map(entries.map((entry) => [entry.aggregateKey, entry]))
    for (const [key, entry] of this.entries) {
      if (next.get(key) === entry) continue
      this.fuse.remove((candidate) => candidate.aggregateKey === key)
      this.sections.get(entry.section)?.remove((candidate) => candidate.aggregateKey === key)
    }
    for (const [key, entry] of next) {
      if (this.entries.get(key) === entry) continue
      this.fuse.add(entry)
      let section = this.sections.get(entry.section)
      if (!section) {
        section = new Fuse<CompletionIndexedEntry>([], completionFuseOptions)
        this.sections.set(entry.section, section)
      }
      section.add(entry)
    }
    this.entries = next
  }

  search(query: string, sectionScoped: boolean, section: string | null) {
    const search = sectionScoped ? this.sections.get(section) : this.fuse
    if (!search) return []
    return search.search(query, { limit: Math.min(search.getIndex().size(), 80) })
  }

  clear() {
    this.entries.clear()
    this.fuse.remove(() => true)
    this.sections.clear()
  }
}
