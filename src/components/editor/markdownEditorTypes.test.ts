import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  markdownEditorVariants,
  type MarkdownEditorHandle,
  type MarkdownEditorProps,
  type MarkdownEditorStatus,
  type MarkdownEditorSlashLabels,
} from '@/components/editor/markdownEditorTypes'

describe('markdownEditorTypes', () => {
  it('exposes the supported editor variants without an editor-engine dependency', () => {
    expect(markdownEditorVariants).toEqual(['page', 'embedded'])
  })

  it('keeps the public editor contract strongly typed', () => {
    expectTypeOf<MarkdownEditorHandle>().toEqualTypeOf<{
      focus: () => void
      getMarkdown: () => Promise<string>
    }>()
    expectTypeOf<MarkdownEditorProps['slashLabels']>().toEqualTypeOf<MarkdownEditorSlashLabels>()
    expectTypeOf<MarkdownEditorStatus>().toMatchTypeOf<
      { phase: 'loading' } | { phase: 'ready' } | { phase: 'error'; message: string }
    >()
  })
})
