import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerMarkdownSourceTextCompletion } from '@/components/markdownSourceTextCompletion'
import {
  createSourceCompletionHarness as createHarness,
  sourceCompletionPreferences as preferences,
} from '@/components/markdownSourceTextCompletionTestHarness'

const setup = (
  value?: string,
  overrides: Partial<Parameters<typeof registerMarkdownSourceTextCompletion>[0]> = {},
) => {
  const harness = createHarness(value)
  const requestCompletion = vi.fn().mockResolvedValue(' with a clear next step')
  const registration = registerMarkdownSourceTextCompletion({
    editor: harness.editor as never,
    getDocumentKey: () => 'notes/current.md',
    getPreferences: preferences,
    monaco: harness.monaco as never,
    requestCompletion,
    resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
    ...overrides,
  })
  return { ...harness, registration, requestCompletion }
}

describe('Markdown source text suggestions', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('returns document suggestions in the IDE menu with their source and plain insertion text', async () => {
    const harness = setup()
    const result = await harness.complete()
    expect(result.suggestions[0]).toMatchObject({
      label: { label: 'to review the notes.', description: 'Document' },
      insertText: 'to review the notes.',
      range: { startLineNumber: 3, startColumn: 8, endLineNumber: 3, endColumn: 10 },
    })
    expect(result.suggestions[0]).not.toHaveProperty('commitCharacters')
    expect(result.suggestions[0]).not.toHaveProperty('insertTextRules')
    await vi.advanceTimersByTimeAsync(2_000)
    expect(harness.requestCompletion).not.toHaveBeenCalled()
    harness.registration.dispose()
  })

  it('limits document suggestions to the active heading group', async () => {
    const spacer = Array.from({ length: 40 }, (_, index) => `Work note ${index}`).join('\n')
    const harness = setup(
      `# Work\nProject plan includes reviewing the release.\n${spacer}\n\n# Personal\nProject plan includes buying groceries.\n\n# Work\nProject plan includes`,
    )
    expect((await harness.complete()).suggestions.map(({ insertText }) => insertText)).toEqual([
      'includes reviewing the release.',
    ])
    harness.registration.dispose()
  })

  it('rechecks the rebuilt document index before sending AI', async () => {
    const harness = setup('Compose an original ending')
    harness.model.getValue.mockClear()
    harness.change('I plan to review the notes.\n\nI plan to')
    const pending = harness.complete()
    await vi.advanceTimersByTimeAsync(250)
    expect((await pending).suggestions[0]?.insertText).toBe('to review the notes.')
    expect(harness.model.getValue).toHaveBeenCalledOnce()
    expect(harness.requestCompletion).not.toHaveBeenCalled()
    harness.registration.dispose()
  })

  it('returns delayed AI suggestions with an AI source without editing the document', async () => {
    const harness = setup('Compose an original ending')
    const pending = harness.complete()
    await vi.advanceTimersByTimeAsync(249)
    expect(harness.requestCompletion).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect((await pending).suggestions[0]).toMatchObject({
      label: { label: 'ending with a clear next step', description: 'AI' },
      insertText: 'ending with a clear next step',
    })
    expect(harness.model.getValue()).toBe('Compose an original ending')
    harness.registration.dispose()
  })

  it.each(['paused', 'disabled', 'read-only', 'IME'])(
    'does not request AI while %s',
    async (mode) => {
      const harness = setup('Compose an original ending', {
        getPreferences: () => ({
          ...preferences(),
          ...(mode === 'paused' ? { aiCompletionSnoozedUntil: Date.now() + 60_000 } : {}),
          ...(mode === 'disabled'
            ? { aiCompletionEnabled: false, documentCompletionEnabled: false }
            : {}),
        }),
      })
      if (mode === 'read-only')
        vi.spyOn(harness.editor, 'getRawOptions').mockReturnValue({ readOnly: true })
      if (mode === 'IME') harness.editor.inComposition = true
      expect((await harness.complete()).suggestions).toEqual([])
      await vi.advanceTimersByTimeAsync(2_000)
      expect(harness.requestCompletion).not.toHaveBeenCalled()
      harness.registration.dispose()
    },
  )

  it('releases a cancelled request even if the AI transport never resolves', async () => {
    let signal: AbortSignal | undefined
    const harness = setup('Compose an original ending', {
      requestCompletion: (_request, nextSignal) => {
        signal = nextSignal
        return new Promise(() => undefined)
      },
    })
    const pending = harness.complete()
    await vi.advanceTimersByTimeAsync(250)
    harness.cancelToken()
    expect((await pending).suggestions).toEqual([])
    expect(signal?.aborted).toBe(true)
    harness.registration.dispose()
  })

  it('cancels stale AI on preference changes and closes the menu', async () => {
    let current = preferences()
    let changed: () => void = () => undefined
    const unsubscribe = vi.fn()
    const harness = setup('Compose an original ending', {
      getPreferences: () => current,
      subscribePreferences: (listener) => {
        changed = listener
        return unsubscribe
      },
      requestCompletion: () => new Promise(() => undefined),
    })
    const pending = harness.complete()
    await vi.advanceTimersByTimeAsync(250)
    current = { ...current, aiCompletionEnabled: false }
    changed()
    expect((await pending).suggestions).toEqual([])
    expect(harness.editor.trigger).toHaveBeenCalledWith('marklab', 'hideSuggestWidget', null)
    harness.registration.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('requires remote consent while allowing a local provider without it', async () => {
    for (const locality of ['remote', 'local'] as const) {
      const harness = setup('Compose an original ending', {
        getPreferences: () => ({ ...preferences(), aiCompletionCloudContextConsent: false }),
        resolveProviderLocality: vi.fn().mockResolvedValue(locality),
      })
      const pending = harness.complete()
      await vi.advanceTimersByTimeAsync(250)
      const result = await pending
      expect(result.suggestions).toHaveLength(locality === 'local' ? 1 : 0)
      expect(harness.requestCompletion).toHaveBeenCalledTimes(locality === 'local' ? 1 : 0)
      harness.registration.dispose()
    }
  })

  it.each(['empty', 'failure'])(
    'keeps the document unchanged after an AI %s response',
    async (outcome) => {
      const harness = setup('Compose an original ending', {
        requestCompletion:
          outcome === 'empty'
            ? async () => null
            : async () => {
                throw new Error('offline')
              },
      })
      const pending = harness.complete()
      await vi.advanceTimersByTimeAsync(250)
      expect((await pending).suggestions).toEqual([])
      expect(harness.model.getValue()).toBe('Compose an original ending')
      harness.registration.dispose()
    },
  )

  it('avoids document reads in the suggestion hot path and debounces rebuilds', async () => {
    const harness = setup(undefined, {
      getPreferences: () => ({ ...preferences(), aiCompletionEnabled: false }),
    })
    harness.model.getValue.mockClear()
    await harness.complete()
    harness.change('I plan to review the notes.\n\nI plan today')
    harness.change('I plan to review the notes.\n\nI plan tomorrow')
    expect(harness.model.getValue).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(180)
    expect(harness.model.getValue).toHaveBeenCalledOnce()
    harness.registration.dispose()
  })
})
