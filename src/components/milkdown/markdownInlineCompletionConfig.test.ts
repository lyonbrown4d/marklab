import { describe, expect, it } from 'vitest'
import {
  buildMarkdownInlineCompletionRequest,
  inlineCompletionDebounceMs,
} from '@/components/milkdown/markdownInlineCompletionConfig'

const context = {
  after: ' suffix',
  before: 'I plan to',
  followingBlocks: ['following block'],
  heading: 'Plans',
  nodeType: 'paragraph',
  precedingBlocks: ['preceding block'],
}

describe('markdown inline completion config', () => {
  it('maps trigger modes to increasing debounce delays', () => {
    expect(inlineCompletionDebounceMs('fast')).toBeLessThan(inlineCompletionDebounceMs('balanced'))
    expect(inlineCompletionDebounceMs('balanced')).toBeLessThan(
      inlineCompletionDebounceMs('battery-saver'),
    )
  })

  it('builds bounded nearby context and limits excluded suggestions', () => {
    const request = buildMarkdownInlineCompletionRequest({
      completionSessionId: 'editor-1',
      context,
      excluded: ['one', 'two', 'three'],
      includeNearbyContext: true,
      length: 'medium',
      providerId: 'provider-1',
      revision: 2,
    })

    expect(request).toMatchObject({
      completionSessionId: 'editor-1',
      excludedSuggestions: ['one', 'two'],
      heading: 'Plans',
      language: 'auto',
      length: 'medium',
      providerId: 'provider-1',
      revision: 2,
    })
    expect(request.prefix).toContain('preceding block')
    expect(request.prefix.endsWith('I plan to')).toBe(true)
    expect(request.suffix).toContain('following block')
  })

  it('omits nearby blocks when disabled and respects transport limits', () => {
    const request = buildMarkdownInlineCompletionRequest({
      completionSessionId: 'editor-1',
      context: {
        ...context,
        after: 'a'.repeat(6_000),
        before: 'b'.repeat(10_000),
      },
      excluded: [],
      includeNearbyContext: false,
      length: 'long',
      providerId: 'provider-1',
      revision: 3,
    })

    expect(request.prefix).toHaveLength(8_192)
    expect(request.prefix).not.toContain('preceding block')
    expect(request.suffix).toHaveLength(4_096)
  })
})
