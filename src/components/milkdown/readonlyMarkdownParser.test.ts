import { describe, expect, it } from 'vitest'
import { parseReadonlyMarkdown } from '@/components/milkdown/readonlyMarkdownParser'

describe('parseReadonlyMarkdown', () => {
  it('uses the Milkdown schema for CommonMark and GFM content', async () => {
    const document = await parseReadonlyMarkdown(
      [
        '## Heading',
        '',
        'First line  ',
        'second line',
        '',
        '| Name | Value |',
        '| --- | --- |',
        '| One | Two |',
      ].join('\n'),
    )

    expect(document.firstChild?.type.name).toBe('heading')
    expect(document.child(1).type.name).toBe('paragraph')
    expect(document.child(1).child(1).type.name).toBe('hardbreak')
    expect(document.lastChild?.type.name).toBe('table')
  })

  it('represents embedded HTML with the Milkdown schema', async () => {
    const document = await parseReadonlyMarkdown('<script>window.evil = true</script>')
    const nodeTypes: string[] = []
    document.descendants((node) => {
      nodeTypes.push(node.type.name)
    })

    expect(document.textContent).not.toContain('window.evil')
    expect(nodeTypes).toContain('html')
  })
})
