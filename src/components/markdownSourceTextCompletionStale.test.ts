import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerMarkdownSourceTextCompletion,
  SOURCE_AI_COMPLETION_DELAY_MS,
} from '@/components/markdownSourceTextCompletion'
import {
  createSourceCompletionHarness,
  sourceCompletionPreferences,
} from '@/components/markdownSourceTextCompletionTestHarness'

describe('Markdown source text suggestion ownership', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it.each(['path', 'revision', 'disposed', 'blur'])(
    'discards a result after its %s changes',
    async (change) => {
      const harness = createSourceCompletionHarness('Compose an original ending')
      let documentKey = 'notes/current.md'
      let resolve: (value: string | null) => void = () => undefined
      const registration = registerMarkdownSourceTextCompletion({
        editor: harness.editor as never,
        getDocumentKey: () => documentKey,
        getPreferences: sourceCompletionPreferences,
        monaco: harness.monaco as never,
        requestCompletion: () =>
          new Promise((accept) => {
            resolve = accept
          }),
        resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
      })
      const pending = harness.complete()
      await vi.advanceTimersByTimeAsync(250)
      if (change === 'path') documentKey = 'notes/other.md'
      if (change === 'revision') harness.change('New document content')
      if (change === 'disposed') registration.dispose()
      if (change === 'blur') harness.blur()
      resolve(' stale path result')
      expect((await pending).suggestions).toEqual([])
      registration.dispose()
    },
  )

  it('ignores another editor model without cancelling this editor request', async () => {
    const harness = createSourceCompletionHarness('Compose an original ending')
    const registration = registerMarkdownSourceTextCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: sourceCompletionPreferences,
      monaco: harness.monaco as never,
      requestCompletion: vi.fn().mockResolvedValue(' tomorrow'),
      resolveProviderLocality: vi.fn().mockResolvedValue('local'),
    })
    const pending = harness.complete()
    const foreign = await harness
      .provider()
      .provideCompletionItems({}, harness.position(), {}, harness.token)
    expect(foreign.suggestions).toEqual([])
    await vi.advanceTimersByTimeAsync(250)
    expect((await pending).suggestions).toHaveLength(1)
    registration.dispose()
  })

  it('uses progressively longer delays for balanced and battery saver modes', () => {
    expect(SOURCE_AI_COMPLETION_DELAY_MS).toEqual({
      fast: 250,
      balanced: 450,
      'battery-saver': 900,
    })
  })
})
