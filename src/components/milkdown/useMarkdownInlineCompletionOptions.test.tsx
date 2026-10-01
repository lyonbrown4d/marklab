import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiInlineCompletionContext } from '@/components/milkdown/aiInlineCompletionContext'
import { useMarkdownInlineCompletionOptions } from '@/components/milkdown/useMarkdownInlineCompletionOptions'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

vi.mock('@/services/aiInlineCompletionRequest', () => ({
  requestAiInlineCompletion: vi.fn(async () => ' tomorrow'),
}))

const context: AiInlineCompletionContext = {
  after: '',
  before: 'I plan to',
  followingBlocks: [],
  heading: 'Plans',
  nodeType: 'paragraph',
  precedingBlocks: ['Earlier'],
}

describe('useMarkdownInlineCompletionOptions', () => {
  beforeEach(() => {
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
    vi.mocked(requestAiInlineCompletion).mockClear()
  })

  it('keeps stable options, indexes the current document, and notifies setting changes', () => {
    const { result, rerender } = renderHook(
      ({ path, value }) =>
        useMarkdownInlineCompletionOptions({ activePath: path, readOnly: false, value }),
      {
        initialProps: {
          path: 'note.md' as string | null,
          value: 'I plan to review the notes tomorrow.',
        },
      },
    )
    const options = result.current
    const listener = vi.fn()
    const unsubscribe = options.subscribeEnabled?.(listener)

    expect(options.getDocumentCompletions?.(context)[0]).toMatchObject({
      source: 'document',
      text: ' review the notes tomorrow.',
    })
    act(() => usePreferencesStore.getState().setDocumentCompletionEnabled(false))
    expect(listener).toHaveBeenCalled()
    expect(options.enabled()).toBe(false)

    rerender({ path: 'other.md', value: 'Other document sentence.' })
    expect(result.current).toBe(options)
    expect(options.getDocumentKey?.()).toBe('other.md')
    unsubscribe?.()
  })

  it('builds and sends a bounded AI request for the selected provider', async () => {
    usePreferencesStore.setState({
      aiCompletionEnabled: true,
      aiCompletionLength: 'long',
      aiCompletionNearbyContextEnabled: false,
      aiCompletionProviderId: 'marklab-local',
    })
    const { result } = renderHook(() =>
      useMarkdownInlineCompletionOptions({
        activePath: 'note.md',
        readOnly: false,
        value: 'I plan to write.',
      }),
    )

    await expect(
      result.current.requestCompletion(context, [' first'], new AbortController().signal),
    ).resolves.toEqual({ source: 'ai', text: ' tomorrow' })
    expect(requestAiInlineCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        excludedSuggestions: [' first'],
        length: 'long',
        prefix: 'I plan to',
        providerId: 'marklab-local',
      }),
      expect.any(AbortSignal),
    )
  })
})
