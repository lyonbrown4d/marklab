import { describe, expect, it } from 'vitest'
import {
  parseFrontmatter,
  updateFrontmatterField,
} from '@/components/plate/frontmatter/plateFrontmatterModel'

describe('plateFrontmatterModel', () => {
  it('keeps annotated sequences source-only so edits cannot remove their comments or anchors', () => {
    const unsupported = 'notes:\n  - one # keep\nshared: &shared [one, two]\ncopy: *shared'
    const source = `title: Demo\naliases: [one]\n${unsupported}`
    const model = parseFrontmatter(source)
    expect(model.fields.map(({ key }) => key)).toEqual(['title', 'aliases'])
    const changed = updateFrontmatterField(source, model.fields[0]!, 'Updated')
    const listChanged = updateFrontmatterField(changed, model.fields[1]!, ['two'])
    expect(listChanged).toBe(`title: Updated\naliases: [ two ]\n${unsupported}`)
  })
  it('rejects transient or invalid numeric/date values without rewriting YAML', () => {
    for (const [source, invalid] of [
      ['priority: 2 # keep\nnested: { exact: yes }', ['', '-', 'hello']],
      ['date: 2026-10-11 # keep', ['', '2026-02-30', 'hello']],
    ] as const) {
      const field = parseFrontmatter(source).fields[0]!
      for (const value of invalid) expect(updateFrontmatterField(source, field, value)).toBe(source)
    }
    const source = 'priority: 2 # keep\nnested: { exact: yes }'
    const field = parseFrontmatter(source).fields[0]!
    expect(updateFrontmatterField(source, field, '3')).toBe(source.replace('2 #', '3 #'))
    expect(updateFrontmatterField(source, field, '1e3')).toContain('priority: 1000 #')
  })
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
