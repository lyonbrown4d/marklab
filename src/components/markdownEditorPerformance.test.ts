import { describe, expect, it, vi } from 'vitest'

import {
  createMarkdownPerformanceFixture,
  markdownEditorPerformancePolicy,
  waitForMarkdownEditorMount,
} from '@/components/markdownEditorPerformance'
import { applyMarkdownSourceFormat } from '@/components/markdownSourceFormatting'
import { minimalEdit } from '@/components/markdownSourceShortcuts'

describe('Markdown editor large-document policy', () => {
  it.each([100_000, 1_000_000, 5_000_000])(
    'creates a deterministic %i character Markdown fixture',
    (size) => {
      const first = createMarkdownPerformanceFixture(size)
      const second = createMarkdownPerformanceFixture(size)

      expect(first).toHaveLength(size)
      expect(second).toBe(first)
      expect(first).toContain('| Column A | Column B |')
    },
  )

  it('degrades background diagnostics and increases update coalescing by document tier', () => {
    expect(markdownEditorPerformancePolicy(100_000)).toEqual({
      diagnostics: 'full',
      deferInitialMount: false,
      largeDocumentMode: false,
      updateThrottleMs: 200,
      virtualizeDocument: false,
    })
    expect(markdownEditorPerformancePolicy(1_000_000)).toEqual({
      diagnostics: 'disabled',
      deferInitialMount: true,
      largeDocumentMode: true,
      updateThrottleMs: 350,
      virtualizeDocument: true,
    })
    expect(markdownEditorPerformancePolicy(5_000_000)).toEqual({
      diagnostics: 'disabled',
      deferInitialMount: true,
      largeDocumentMode: true,
      updateThrottleMs: 650,
      virtualizeDocument: true,
    })
  })

  it('detects line-dense Markdown before character thresholds are reached', () => {
    expect(markdownEditorPerformancePolicy('x\n'.repeat(29_256))).toEqual({
      diagnostics: 'disabled',
      deferInitialMount: true,
      largeDocumentMode: true,
      updateThrottleMs: 650,
      virtualizeDocument: true,
    })
  })

  it('turns a 5 MB source formatting result into a local Monaco edit', () => {
    const fixture = createMarkdownPerformanceFixture(5_000_000)
    const selectionStart = fixture.indexOf('Marklab')
    const result = applyMarkdownSourceFormat({
      action: 'editor.bold',
      selectionEnd: selectionStart + 'Marklab'.length,
      selectionStart,
      text: fixture,
    })
    const edit = minimalEdit(fixture, result.text)

    expect(edit.end - edit.start).toBe('Marklab'.length)
    expect(edit.text).toBe('**Marklab**')
    expect(fixture.length - (edit.end - edit.start)).toBeGreaterThan(4_999_000)
  })

  it('defers only large editor mounts by one scheduler turn', async () => {
    vi.useFakeTimers()
    expect(waitForMarkdownEditorMount(100_000)).toBeUndefined()
    const pending = waitForMarkdownEditorMount(1_000_000)
    expect(pending).toBeInstanceOf(Promise)
    expect(waitForMarkdownEditorMount('x\n'.repeat(5_000))).toBeInstanceOf(Promise)

    await vi.runAllTimersAsync()
    await expect(pending).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
