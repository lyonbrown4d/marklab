import { describe, expect, it } from 'vitest'
import {
  createLocalHistoryDiffModel,
  createLocalHistoryDiffRows,
} from '@/components/local-history/LocalHistoryLargeDiff'

describe('createLocalHistoryDiffRows', () => {
  it('aligns replacements and preserves line numbers', () => {
    const rows = createLocalHistoryDiffRows('one\nold\nthree\n', 'one\nnew\nthree\n')

    expect(rows).toHaveLength(3)
    expect(rows[1]).toEqual({
      left: { line: 2, text: 'old', tone: 'removed' },
      right: { line: 2, text: 'new', tone: 'added' },
    })
    expect(rows[2]?.left.line).toBe(3)
    expect(rows[2]?.right.line).toBe(3)
  })

  it('keeps large unchanged ranges compact and derives only requested rows', () => {
    const original = Array.from({ length: 30_000 }, (_, index) => `line ${index}`).join('\n')
    const modified = original.replace('line 15000', 'changed')
    const model = createLocalHistoryDiffModel(original, modified)

    expect(model.rowCount).toBe(30_000)
    expect(model.segmentCount).toBeLessThan(8)
    expect(model.rowAt(15_000)).toEqual({
      left: { line: 15_001, text: 'line 15000', tone: 'removed' },
      right: { line: 15_001, text: 'changed', tone: 'added' },
    })
  })
})
