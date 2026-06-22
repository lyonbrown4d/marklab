import type { FsIndexedMarkdownFile, FsWorkspaceIndex } from '@/services/fsApi'
import type { FileEntry } from '@/store/appTypes'

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

export type AllPagesModel = {
  folders: string[]
  rows: AllPagesRow[]
  totalRows: number
}

export const defaultAllPagesFilters: AllPagesFilters = {
  folder: 'all',
  issuesOnly: false,
  query: '',
  sort: 'title',
}

export const buildAllPagesRows = (
  files: FileEntry[],
  workspaceIndex: FsWorkspaceIndex | null,
): AllPagesRow[] => {
  const indexedFiles = workspaceIndex?.files ?? []
  if (indexedFiles.length > 0) {
    return indexedFiles.map(indexedFileToRow)
  }

  return files
    .filter((file) => file.kind === 'file' && isMarkdownPath(file.path))
    .map((file) => ({
      assets: null,
      folder: folderName(file.path),
      headings: null,
      indexed: false,
      issues: 0,
      links: null,
      path: file.path,
      title: fileName(file.path),
    }))
}

export const buildAllPagesModel = (
  files: FileEntry[],
  workspaceIndex: FsWorkspaceIndex | null,
  filters: AllPagesFilters,
): AllPagesModel => buildAllPagesModelFromRows(buildAllPagesRows(files, workspaceIndex), filters)

export const buildAllPagesModelFromRows = (
  rows: AllPagesRow[],
  filters: AllPagesFilters,
): AllPagesModel => {
  const query = filters.query.trim().toLowerCase()
  const filteredRows = rows.filter((row) => {
    if (filters.folder !== 'all' && row.folder !== filters.folder) return false
    if (filters.issuesOnly && row.issues === 0) return false
    if (!query) return true
    return [row.title, row.path, row.folder].join('\n').toLowerCase().includes(query)
  })

  filteredRows.sort((first, second) => compareRows(first, second, filters.sort))

  return {
    folders: uniqueFolders(rows),
    rows: filteredRows,
    totalRows: rows.length,
  }
}

const indexedFileToRow = (file: FsIndexedMarkdownFile): AllPagesRow => {
  const title = file.headings.find((heading) => heading.level === 1)?.text ?? fileName(file.path)
  const assets = file.assets ?? []

  return {
    assets: assets.length,
    folder: folderName(file.path),
    headings: file.headings.length,
    indexed: true,
    issues: file.links.filter(hasBrokenLink).length + assets.filter(hasBrokenAsset).length,
    links: file.links.length,
    path: file.path,
    title,
  }
}

const compareRows = (first: AllPagesRow, second: AllPagesRow, sort: AllPagesSortKey) => {
  if (sort === 'path') return first.path.localeCompare(second.path)
  if (sort === 'headings') return compareNullableNumber(second.headings, first.headings)
  if (sort === 'links') return compareNullableNumber(second.links, first.links)
  if (sort === 'issues')
    return second.issues - first.issues || first.title.localeCompare(second.title)
  return first.title.localeCompare(second.title)
}

const compareNullableNumber = (first: number | null, second: number | null) =>
  (first ?? -1) - (second ?? -1)

const hasBrokenLink = (link: FsIndexedMarkdownFile['links'][number]) => {
  if (link.is_external || !link.target.trim()) return false
  if (!link.target_path) return true
  return Boolean(link.target_anchor && !link.target_heading_slug)
}

const hasBrokenAsset = (asset: NonNullable<FsIndexedMarkdownFile['assets']>[number]) =>
  !asset.is_external && asset.target.trim().length > 0 && !asset.target_path

const isMarkdownPath = (path: string) => /\.mdx?$/i.test(path)

const fileName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() ?? path

const folderName = (path: string) => {
  const parts = path.split(/[\\/]/).filter(Boolean)
  if (parts.length <= 1) return '/'
  return parts.slice(0, -1).join('/')
}

const uniqueFolders = (rows: AllPagesRow[]) => {
  const folders = Array.from(new Set(rows.map((row) => row.folder)))
  folders.sort((first, second) => first.localeCompare(second))
  return folders
}
