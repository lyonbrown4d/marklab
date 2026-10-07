export type AllPagesSortKey = 'title' | 'path' | 'headings' | 'links' | 'issues'

export const allPagesSortKeys: readonly AllPagesSortKey[] = [
  'title',
  'path',
  'headings',
  'links',
  'issues',
]

export type AllPagesFilters = {
  folder: string
  issuesOnly: boolean
  query: string
  sort: AllPagesSortKey
}

export type AllPagesRow = {
  assets: number | null
  folder: string
  headings: number | null
  indexed: boolean
  issues: number
  links: number | null
  path: string
  title: string
}

export const defaultAllPagesFilters: AllPagesFilters = {
  folder: 'all',
  issuesOnly: false,
  query: '',
  sort: 'title',
}
