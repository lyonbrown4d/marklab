import { describe, expect, it } from 'vitest'

import { parseMarkdownAst } from '@electron/services/workspace/markdown/ast'
import { structuralDiagnosticsForMarkdown } from '@electron/services/workspace/markdown/structuralDiagnostics'

const diagnose = (content: string) =>
  structuralDiagnosticsForMarkdown(content, parseMarkdownAst(content))

describe('structuralDiagnosticsForMarkdown', () => {
  it('reports heading-level gaps while ignoring heading syntax in code', () => {
    const diagnostics = diagnose(
      ['# One', '## Two', '#### Four', '```md', '# Not a heading', '```', '### Three'].join('\n'),
    )

    expect(diagnostics).toEqual([
      {
        end_column: 5,
        line: 3,
        message: 'Heading level jumps from 2 to 4',
        severity: 'warning',
        start_column: 1,
      },
    ])
  })

  it('reports duplicate and unresolved footnotes without flagging escaped or code text', () => {
    const diagnostics = diagnose(
      [
        'Known[^note] missing[^lost].',
        '\\[^escaped] and `[^code]`',
        '',
        '[^note]: First',
        '[^NOTE]: Duplicate',
      ].join('\n'),
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({
        line: 1,
        message: 'Cannot find footnote definition "lost"',
        severity: 'warning',
      }),
      expect.objectContaining({
        line: 5,
        message: 'Duplicate footnote definition "note" also appears on line 4',
        severity: 'warning',
      }),
    ])
  })

  it('reports malformed and unclosed YAML frontmatter without treating a divider as metadata', () => {
    expect(diagnose(['---', 'tags: [one', '---', '', '# Note'].join('\n'))).toEqual([
      expect.objectContaining({
        line: 2,
        message: expect.stringContaining('Malformed YAML frontmatter:'),
        severity: 'error',
      }),
    ])
    expect(diagnose(['---', 'title: Draft', '# Note'].join('\n'))).toEqual([
      expect.objectContaining({
        line: 1,
        message: 'YAML frontmatter is not closed',
        severity: 'error',
      }),
    ])
    expect(diagnose(['---', '', '# Note'].join('\n'))).toEqual([])
  })

  it('reports empty alternative text for inline and reference images', () => {
    const diagnostics = diagnose(
      ['![](asset.png)', '![Diagram](diagram.png)', '![][logo]', '', '[logo]: logo.png'].join('\n'),
    )

    expect(diagnostics).toEqual([
      expect.objectContaining({ line: 1, message: 'Image is missing alternative text' }),
      expect.objectContaining({ line: 3, message: 'Image is missing alternative text' }),
    ])
  })
})
