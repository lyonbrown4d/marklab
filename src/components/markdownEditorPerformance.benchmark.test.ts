import { describe, expect, it } from 'vitest'

import { runMarkdownEditorTransformBenchmark } from '@/components/markdownEditorPerformance.benchmark'

describe('Markdown editor deterministic benchmark', () => {
  it('records transform duration without using wall-clock pass/fail thresholds', () => {
    const results = runMarkdownEditorTransformBenchmark()

    expect(results.map((result) => result.size)).toEqual([100_000, 1_000_000, 5_000_000])
    expect(results.every((result) => result.durationMs >= 0)).toBe(true)
    expect(results.every((result) => result.editPayloadChars === 11)).toBe(true)
    expect(results.at(-1)?.fullDocumentChars).toBe(5_000_004)
    console.table(results)
  })
})
