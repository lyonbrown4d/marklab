import type { AllPagesRow } from '@/logic/allPages'

export type AllPagesViewMode = 'table' | 'cards' | 'folders'

export type AllPagesFolderGroup = {
  assets: number
  folder: string
  headings: number
  issues: number
  links: number
  rows: AllPagesRow[]
}

export const allPagesViewModes: readonly AllPagesViewMode[] = ['table', 'cards', 'folders']

export const groupAllPagesRowsByFolder = (rows: AllPagesRow[]): AllPagesFolderGroup[] => {
  const groupsByFolder = new Map<string, AllPagesFolderGroup>()

  rows.forEach((row) => {
    const group =
      groupsByFolder.get(row.folder) ??
      ({
        assets: 0,
        folder: row.folder,
        headings: 0,
        issues: 0,
        links: 0,
        rows: [],
      } satisfies AllPagesFolderGroup)

    group.assets += row.assets ?? 0
    group.headings += row.headings ?? 0
    group.issues += row.issues
    group.links += row.links ?? 0
    group.rows.push(row)
    groupsByFolder.set(row.folder, group)
  })

  const groups = Array.from(groupsByFolder.values())
  groups.sort((first, second) => {
    if (first.folder === '/') return -1
    if (second.folder === '/') return 1
    return first.folder.localeCompare(second.folder)
  })

  return groups
}
