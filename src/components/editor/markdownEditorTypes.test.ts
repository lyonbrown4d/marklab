import { describe, expectTypeOf, it } from 'vitest'
import {
  type MarkdownEditorHandle,
  type MarkdownEditorProps,
  type MarkdownEditorStatus,
  type MarkdownEditorSlashLabels,
} from '@/components/editor/markdownEditorTypes'

describe('markdownEditorTypes', () => {
  it('keeps the public editor contract strongly typed', () => {
    expectTypeOf<MarkdownEditorHandle>().toEqualTypeOf<{
      focus: () => void
      getMarkdown: () => Promise<string>
    }>()
    expectTypeOf<MarkdownEditorProps['slashLabels']>().toEqualTypeOf<MarkdownEditorSlashLabels>()
    expectTypeOf<MarkdownEditorStatus>().toEqualTypeOf<
      { phase: 'loading' } | { phase: 'ready' } | { phase: 'error'; message: string }
    >()
  })
})
