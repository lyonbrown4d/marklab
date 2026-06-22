import type { AllPagesRow } from '@/logic/allPages'

export type MarkdownCollectionRule =
  | { kind: 'all' }
  | { kind: 'hasIssues' }
  | { kind: 'minHeadings'; value: number }
  | { kind: 'minLinks'; value: number }

export type MarkdownCollectionDefinition = {
  descriptionKey: string
  id: string
  labelKey: string
  rules: readonly MarkdownCollectionRule[]
}

export type MarkdownCollectionSummary = MarkdownCollectionDefinition & {
  count: number
}

export const builtInMarkdownCollections: readonly MarkdownCollectionDefinition[] = [
  {
    descriptionKey: 'collections.all.description',
    id: 'all',
    labelKey: 'collections.all.label',
    rules: [{ kind: 'all' }],
  },
  {
    descriptionKey: 'collections.needsAttention.description',
    id: 'needs-attention',
    labelKey: 'collections.needsAttention.label',
    rules: [{ kind: 'hasIssues' }],
  },
  {
    descriptionKey: 'collections.linked.description',
    id: 'linked',
    labelKey: 'collections.linked.label',
    rules: [{ kind: 'minLinks', value: 1 }],
  },
  {
    descriptionKey: 'collections.structured.description',
    id: 'structured',
    labelKey: 'collections.structured.label',
    rules: [{ kind: 'minHeadings', value: 3 }],
  },
]

export const summarizeMarkdownCollections = (
  rows: AllPagesRow[],
  collections: readonly MarkdownCollectionDefinition[],
): MarkdownCollectionSummary[] =>
  collections.map((collection) => ({
    ...collection,
    count: filterRowsByMarkdownCollection(rows, collection).length,
  }))

export const filterRowsByMarkdownCollection = (
  rows: AllPagesRow[],
  collection: MarkdownCollectionDefinition,
) => rows.filter((row) => matchesMarkdownCollection(row, collection))

export const matchesMarkdownCollection = (
  row: AllPagesRow,
  collection: MarkdownCollectionDefinition,
) => collection.rules.every((rule) => matchesMarkdownCollectionRule(row, rule))

const matchesMarkdownCollectionRule = (row: AllPagesRow, rule: MarkdownCollectionRule) => {
  if (rule.kind === 'all') return true
  if (rule.kind === 'hasIssues') return row.issues > 0
  if (rule.kind === 'minHeadings') return (row.headings ?? 0) >= rule.value
  if (rule.kind === 'minLinks') return (row.links ?? 0) >= rule.value
  return false
}
