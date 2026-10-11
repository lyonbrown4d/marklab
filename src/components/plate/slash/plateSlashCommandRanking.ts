import Fuse from 'fuse.js'
import type { PlateSlashCommand } from '@/components/plate/slash/types'

type RankedCommand = {
  catalogIndex: number
  command: PlateSlashCommand
  fuzzyScore: number
  recentIndex: number
  textRank: number
}

const normalize = (value: string) => value.trim().toLocaleLowerCase()

const getSearchTerms = (command: PlateSlashCommand) => [
  normalize(command.label),
  normalize(command.key),
  ...command.aliases.map(normalize),
]

const getTextRank = (command: PlateSlashCommand, query: string) => {
  const terms = getSearchTerms(command)
  if (terms.some((term) => term === query)) return 0
  if (terms.some((term) => term.startsWith(query))) return 1
  if (terms.some((term) => term.includes(query))) return 2
  return 3
}

export const rankPlateSlashCommands = (
  commands: readonly PlateSlashCommand[],
  query: string,
  recentKeys: readonly string[],
) => {
  const needle = normalize(query)
  const recentPositions = new Map(recentKeys.map((key, index) => [key, index]))
  if (!needle) {
    return [...commands].sort((left, right) => {
      const leftRecent = recentPositions.get(left.key) ?? Number.MAX_SAFE_INTEGER
      const rightRecent = recentPositions.get(right.key) ?? Number.MAX_SAFE_INTEGER
      return leftRecent - rightRecent || commands.indexOf(left) - commands.indexOf(right)
    })
  }

  const fuse = new Fuse(commands, {
    includeScore: true,
    keys: ['label', 'key', 'aliases'],
    shouldSort: false,
    threshold: 0.45,
  })
  const ranked: RankedCommand[] = fuse.search(needle).map(({ item, score }) => ({
    catalogIndex: commands.indexOf(item),
    command: item,
    fuzzyScore: score ?? 1,
    recentIndex: recentPositions.get(item.key) ?? Number.MAX_SAFE_INTEGER,
    textRank: getTextRank(item, needle),
  }))

  return ranked
    .sort(
      (left, right) =>
        left.textRank - right.textRank ||
        left.fuzzyScore - right.fuzzyScore ||
        left.recentIndex - right.recentIndex ||
        left.catalogIndex - right.catalogIndex,
    )
    .map(({ command }) => command)
}
