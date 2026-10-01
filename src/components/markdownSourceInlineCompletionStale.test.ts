import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerMarkdownSourceInlineCompletion,
  SOURCE_AI_COMPLETION_DELAY_MS,
} from '@/components/markdownSourceInlineCompletion'
import {
  createSourceCompletionHarness,
  sourceCompletionContext,
  sourceCompletionPreferences,
} from '@/components/markdownSourceInlineCompletionTestHarness'

describe('markdown source inline completion stale state', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('discards a result when the document path changes without a model revision', async () => {
    const harness = createSourceCompletionHarness()
    let documentKey = 'notes/current.md'
    let resolve: (value: string | null) => void = () => undefined
    const requestCompletion = vi.fn(
      () =>
        new Promise<string | null>((nextResolve) => {
          resolve = nextResolve
        }),
    )
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => documentKey,
      getPreferences: sourceCompletionPreferences,
      monaco: harness.monaco as never,
      requestCompletion,
      resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
    })
    const changed = vi.fn()
    harness.provider().onDidChangeInlineCompletions(changed)
    harness
      .provider()
      .provideInlineCompletions(
        harness.model,
        harness.position(),
        sourceCompletionContext,
        harness.token,
      )
    await vi.advanceTimersByTimeAsync(250)

    documentKey = 'notes/other.md'
    resolve(' stale path result')
    await Promise.resolve()
    expect(changed).not.toHaveBeenCalled()
  })

  it('uses progressively longer delays for balanced and battery saver modes', () => {
    expect(SOURCE_AI_COMPLETION_DELAY_MS).toEqual({
      fast: 250,
      balanced: 450,
      'battery-saver': 900,
    })
  })
})
