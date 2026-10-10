import { describe, expect, it } from 'vitest'
import {
  parseFrontmatter,
  updateFrontmatterField,
} from '@/components/plate/frontmatter/plateFrontmatterModel'

describe('plateFrontmatterModel', () => {
  it('classifies common frontmatter values and leaves complex values unsupported', () => {
    const model = parseFrontmatter(
      [
        'title: Demo',
        'priority: 2',
        'tag: note',
        'published: true',
        'date: 2026-10-11',
        'website: https://example.com',
        'aliases: [one, two]',
        'tags:',
        '  - plate',
        '  - editor',
        'description: |',
        '  Keep this block scalar.',
        'nested:',
        '  owner: Marklab',
        'shared: &shared value',
      ].join('\n'),
    )

    expect(model.error).toBeNull()
    expect(model.fields.map(({ key, kind }) => [key, kind])).toEqual([
      ['title', 'scalar'],
      ['priority', 'scalar'],
      ['tag', 'tag'],
      ['published', 'boolean'],
      ['date', 'date'],
      ['website', 'link'],
      ['aliases', 'list'],
      ['tags', 'tags'],
    ])
    expect(model.unsupportedCount).toBe(3)
  })

  it('updates only the selected scalar range and preserves unsupported YAML byte-for-byte', () => {
    const source = [
      '# document comment',
      'title: Demo # title comment',
      'nested:',
      '  owner: Marklab',
      'shared: &shared value',
      'copy: *shared',
    ].join('\n')
    const field = parseFrontmatter(source).fields.find(({ key }) => key === 'title')!

    expect(updateFrontmatterField(source, field, 'A: safer title')).toBe(
      source.replace('title: Demo', 'title: "A: safer title"'),
    )
  })

  it('edits block and flow string lists without rewriting sibling properties', () => {
    const blockSource = ['tags:', '  - plate', '  - editor', 'nested: { keep: exact }'].join('\n')
    const blockField = parseFrontmatter(blockSource).fields[0]!
    expect(updateFrontmatterField(blockSource, blockField, ['one', 'two words'])).toBe(
      ['tags:', '  - one', '  - two words', 'nested: { keep: exact }'].join('\n'),
    )

    const flowSource = 'aliases: [one, two] # keep\nunknown: !custom exact'
    const flowField = parseFrontmatter(flowSource).fields[0]!
    expect(updateFrontmatterField(flowSource, flowField, ['first', 'second'])).toBe(
      'aliases: [ first, second ] # keep\nunknown: !custom exact',
    )
  })

  it('falls back to source mode data for malformed or non-mapping YAML', () => {
    expect(parseFrontmatter('title: [broken').error).not.toBeNull()
    expect(parseFrontmatter('- one\n- two').error).toBe('Frontmatter must be a YAML mapping.')
  })
})
