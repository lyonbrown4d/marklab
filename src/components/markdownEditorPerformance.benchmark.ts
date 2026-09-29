import { createMarkdownPerformanceFixture } from '@/components/markdownEditorPerformance'
import { applyMarkdownSourceFormat } from '@/components/markdownSourceFormatting'
import { minimalEdit } from '@/components/markdownSourceShortcuts'

export type MarkdownEditorBenchmarkResult = {
  durationMs: number
  editPayloadChars: number
  fullDocumentChars: number
  size: number
}

export const runMarkdownEditorTransformBenchmark = (
  sizes: readonly number[] = [100_000, 1_000_000, 5_000_000],
): MarkdownEditorBenchmarkResult[] =>
  sizes.map((size) => {
    const fixture = createMarkdownPerformanceFixture(size)
    const selectionStart = fixture.indexOf('Marklab')
    const startedAt = performance.now()
    const result = applyMarkdownSourceFormat({
      action: 'editor.bold',
      selectionEnd: selectionStart + 'Marklab'.length,
      selectionStart,
      text: fixture,
    })
    const edit = minimalEdit(fixture, result.text)
    const durationMs = performance.now() - startedAt
    return {
      durationMs,
      editPayloadChars: edit.text.length,
      fullDocumentChars: result.text.length,
      size,
    }
  })
