import { describe, expect, it } from 'vitest'
import type { PlateSlashCommand } from '@/components/plate/slash/types'
import { rankPlateSlashCommands } from '@/components/plate/slash/plateSlashCommandRanking'

const command = (key: string, label: string, aliases: readonly string[] = []): PlateSlashCommand =>
  ({
    aliases,
    commandId: `editor.${key}`,
    group: 'text',
    icon: (() => null) as unknown as PlateSlashCommand['icon'],
    key,
    kind: 'block',
    label,
  }) as PlateSlashCommand

const commands = [
  command('h1', 'Heading 1', ['title']),
  command('quote', 'Quote', ['blockquote']),
  command('table', 'Table', ['grid']),
]

describe('rankPlateSlashCommands', () => {
  it('ranks exact and prefix matches before fuzzy matches', () => {
    expect(rankPlateSlashCommands(commands, 'quote', []).map(({ key }) => key)).toEqual(['quote'])
    expect(rankPlateSlashCommands(commands, 'tit', []).map(({ key }) => key)).toEqual(['h1'])
    expect(rankPlateSlashCommands(commands, 'hading', []).map(({ key }) => key)).toEqual(['h1'])
  })

  it('uses recent commands only as ordering context and never duplicates commands', () => {
    expect(rankPlateSlashCommands(commands, '', ['table', 'quote']).map(({ key }) => key)).toEqual([
      'table',
      'quote',
      'h1',
    ])
    expect(rankPlateSlashCommands(commands, 't', ['table']).map(({ key }) => key)).toEqual([
      'table',
      'h1',
      'quote',
    ])
  })

  it('normalizes localized labels and aliases without mutating the catalog', () => {
    const localized = [command('heading', '一级标题', ['heading one'])]
    const ranked = rankPlateSlashCommands(localized, '标题', [])

    expect(ranked.map(({ key }) => key)).toEqual(['heading'])
    expect(localized[0]?.aliases).toEqual(['heading one'])
  })
})
