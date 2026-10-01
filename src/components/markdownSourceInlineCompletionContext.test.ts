import { describe, expect, it, vi } from 'vitest'
import { buildMarkdownSourceInlineCompletionContext } from '@/components/markdownSourceInlineCompletionContext'

describe('markdown source inline completion context', () => {
  it('reads only bounded nearby lines and never requests the whole model value', () => {
    const lines = Array.from({ length: 200 }, (_, index) =>
      index === 80 ? '# Current section' : `Line ${index + 1} has useful nearby text`,
    )
    const model = {
      getLineContent: vi.fn((line: number) => lines[line - 1] ?? ''),
      getLineCount: () => lines.length,
      getOffsetAt: vi.fn(() => 2_400),
      getValue: vi.fn(),
    }

    const result = buildMarkdownSourceInlineCompletionContext(
      model as never,
      { lineNumber: 100, column: 12 } as never,
      true,
    )

    expect(result?.prefix).toContain('Line 100')
    expect(result?.heading).toBe('Current section')
    expect(model.getLineContent.mock.calls.length).toBeLessThanOrEqual(40)
    expect(model.getValue).not.toHaveBeenCalled()
    expect(result?.prefix.length).toBeLessThanOrEqual(8_192)
    expect(result?.suffix.length).toBeLessThanOrEqual(4_096)
  })

  it('uses only the current line when nearby context is disabled', () => {
    const model = {
      getLineContent: vi.fn((line: number) => (line === 2 ? 'Current line suffix' : 'Other line')),
      getLineCount: () => 3,
      getOffsetAt: () => 12,
    }

    const result = buildMarkdownSourceInlineCompletionContext(
      model as never,
      { lineNumber: 2, column: 8 } as never,
      false,
    )

    expect(result).toMatchObject({ prefix: 'Current', suffix: ' line suffix', heading: null })
    expect(model.getLineContent).toHaveBeenCalledOnce()
  })
})
