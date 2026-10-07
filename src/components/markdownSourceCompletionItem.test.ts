import { describe, expect, it } from 'vitest'
import { fromLanguageCompletion } from '@/components/markdownSourceCompletion'

describe('Markdown source completion item', () => {
  it('preserves LSP documentation for the Monaco details pane', () => {
    expect(
      fromLanguageCompletion({
        label: 'Architecture',
        detail: 'docs/architecture.md',
        documentation: { kind: 'markdown', value: '**Architecture preview**' },
      }),
    ).toMatchObject({
      label: 'Architecture',
      detail: 'docs/architecture.md',
      documentation: { kind: 'markdown', value: '**Architecture preview**' },
    })
  })
})
