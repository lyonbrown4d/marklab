import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerMarkdownSourceInlineCompletion } from '@/components/markdownSourceInlineCompletion'
import {
  createSourceCompletionHarness as createHarness,
  sourceCompletionPreferences as preferences,
} from '@/components/markdownSourceInlineCompletionTestHarness'

describe('markdown source inline completion', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('registers a native Monaco provider and returns document candidates immediately', () => {
    const harness = createHarness()
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: preferences,
      monaco: harness.monaco as never,
      requestCompletion: vi.fn(),
    })

    const result = harness.complete()

    expect(harness.monaco.languages.registerInlineCompletionsProvider).toHaveBeenCalledWith(
      'markdown',
      expect.any(Object),
    )
    expect(result.items[0]?.insertText).toBe(' review the notes.')
    expect(harness.editor.addCommand).toHaveBeenCalledTimes(2)
  })

  it('limits local candidates to the active Markdown heading group', () => {
    const spacer = Array.from({ length: 40 }, (_, index) => `Work note ${index}`).join('\n')
    const harness = createHarness(`# Work
Project plan includes reviewing the release.
${spacer}

# Personal
Project plan includes buying groceries.

# Work
Project plan includes`)
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: () => ({
        ...preferences(),
        aiCompletionEnabled: false,
        aiCompletionNearbyContextEnabled: false,
      }),
      monaco: harness.monaco as never,
      requestCompletion: vi.fn(),
    })

    const result = harness.complete()

    expect(result.items.map(({ insertText }) => insertText)).toEqual([' reviewing the release.'])
  })

  it('returns document candidates without scheduling AI', async () => {
    const harness = createHarness()
    const requestCompletion = vi.fn().mockResolvedValue(' finish the draft')
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: preferences,
      monaco: harness.monaco as never,
      requestCompletion,
      resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
    })
    const initial = harness.complete()
    expect(initial.items).toHaveLength(1)
    expect(requestCompletion).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2_000)
    expect(requestCompletion).not.toHaveBeenCalled()
  })

  it('rechecks the rebuilt local index before sending AI', async () => {
    const harness = createHarness('Compose an original ending')
    const requestCompletion = vi.fn(() => new Promise<string | null>(() => undefined))
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: preferences,
      monaco: harness.monaco as never,
      requestCompletion,
      resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
    })
    const changed = vi.fn()
    harness.provider().onDidChangeInlineCompletions(changed)
    harness.model.getValue.mockClear()
    harness.change('I plan to review the notes.\n\nI plan to')
    expect(harness.complete().items).toEqual([])
    await vi.advanceTimersByTimeAsync(180)
    expect(harness.model.getValue).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(70)
    expect(requestCompletion).not.toHaveBeenCalled()
    expect(changed).toHaveBeenCalledOnce()
    expect(harness.complete().items[0]?.insertText).toBe(' review the notes.')
  })

  it('returns delayed AI as the only candidate when the document has no match', async () => {
    const harness = createHarness('Compose an original ending')
    const requestCompletion = vi.fn().mockResolvedValue(' with a clear next step')
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: preferences,
      monaco: harness.monaco as never,
      requestCompletion,
      resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
    })
    const provider = harness.provider()
    const changed = vi.fn()
    provider.onDidChangeInlineCompletions(changed)

    const initial = harness.complete()
    expect(initial.items).toEqual([])
    await vi.advanceTimersByTimeAsync(250)
    expect(requestCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        completionSessionId: expect.any(String),
        providerId: 'provider-1',
        revision: 1,
      }),
      expect.any(AbortSignal),
    )
    expect(changed).toHaveBeenCalledOnce()
    const refreshed = harness.complete()
    expect(refreshed.items.map(({ insertText }) => insertText)).toEqual([' with a clear next step'])
  })

  it('cancels and discards AI work after token, version, or path becomes stale', async () => {
    const harness = createHarness('Compose an original ending')
    let resolve: (value: string | null) => void = () => undefined
    let signal: AbortSignal | undefined
    const requestCompletion = vi.fn((_input, nextSignal: AbortSignal) => {
      signal = nextSignal
      return new Promise<string | null>((nextResolve) => {
        resolve = nextResolve
      })
    })
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: preferences,
      monaco: harness.monaco as never,
      requestCompletion,
      resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
    })
    const provider = harness.provider()
    const changed = vi.fn()
    provider.onDidChangeInlineCompletions(changed)
    harness.complete()
    await vi.advanceTimersByTimeAsync(250)

    harness.setPath('notes/other.md')
    harness.change('I plan to review the notes.\n\nI plan today')
    harness.cancelToken()
    resolve(' stale result')
    await Promise.resolve()

    expect(signal?.aborted).toBe(true)
    expect(changed).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'read-only',
      setup: (harness: ReturnType<typeof createHarness>) =>
        vi.spyOn(harness.editor, 'getRawOptions').mockReturnValue({ readOnly: true }),
    },
    {
      label: 'IME composition',
      setup: (harness: ReturnType<typeof createHarness>) => {
        harness.editor.inComposition = true
      },
    },
    {
      label: 'disabled features',
      setup: () => undefined,
      prefs: () => ({
        ...preferences(),
        aiCompletionEnabled: false,
        documentCompletionEnabled: false,
      }),
    },
  ])('does not complete while $label', ({ setup, prefs = preferences }) => {
    const harness = createHarness()
    setup(harness)
    const requestCompletion = vi.fn()
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: prefs,
      monaco: harness.monaco as never,
      requestCompletion,
    })

    const result = harness.complete()
    vi.advanceTimersByTime(2_000)

    expect(result.items).toEqual([])
    expect(requestCompletion).not.toHaveBeenCalled()
  })

  it('avoids getValue in the completion hot path and debounces index rebuild reads', () => {
    const harness = createHarness()
    registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: () => ({ ...preferences(), aiCompletionEnabled: false }),
      monaco: harness.monaco as never,
      requestCompletion: vi.fn(),
    })
    harness.model.getValue.mockClear()

    harness.complete()
    harness.change('I plan to review the notes.\n\nI plan today')
    harness.change('I plan to review the notes.\n\nI plan tomorrow')
    expect(harness.model.getValue).not.toHaveBeenCalled()

    vi.advanceTimersByTime(180)
    expect(harness.model.getValue).toHaveBeenCalledOnce()
  })

  it('reacts to preference subscriptions by cancelling and clearing stale AI suggestions', async () => {
    const harness = createHarness('Compose an original ending')
    let current = preferences()
    let notifyPreferences: () => void = () => undefined
    let resolve: (value: string | null) => void = () => undefined
    let signal: AbortSignal | undefined
    const requestCompletion = vi.fn((_input: unknown, nextSignal: AbortSignal) => {
      signal = nextSignal
      return new Promise<string | null>((nextResolve) => {
        resolve = nextResolve
      })
    })
    const unsubscribe = vi.fn()
    const registration = registerMarkdownSourceInlineCompletion({
      editor: harness.editor as never,
      getDocumentKey: () => 'notes/current.md',
      getPreferences: () => current,
      monaco: harness.monaco as never,
      requestCompletion,
      resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
      subscribePreferences: (listener) => {
        notifyPreferences = listener
        return unsubscribe
      },
    })
    const provider = harness.provider()
    const changed = vi.fn()
    provider.onDidChangeInlineCompletions(changed)
    harness.complete()
    await vi.advanceTimersByTimeAsync(250)

    current = { ...current, aiCompletionEnabled: false }
    notifyPreferences()
    resolve(' stale')
    await Promise.resolve()

    expect(signal?.aborted).toBe(true)
    expect(changed).toHaveBeenCalledOnce()
    expect(harness.complete().items).toHaveLength(0)
    registration.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('requires consent for remote AI but allows local providers without it', async () => {
    const remote = createHarness('Compose an original remote ending')
    const local = createHarness('Compose an original local ending')
    const remoteRequest = vi.fn().mockResolvedValue(' remote')
    const localRequest = vi.fn().mockResolvedValue(' local')
    const noConsent = () => ({ ...preferences(), aiCompletionCloudContextConsent: false })
    registerMarkdownSourceInlineCompletion({
      editor: remote.editor as never,
      getDocumentKey: () => 'remote.md',
      getPreferences: noConsent,
      monaco: remote.monaco as never,
      requestCompletion: remoteRequest,
      resolveProviderLocality: vi.fn().mockResolvedValue('remote'),
    })
    registerMarkdownSourceInlineCompletion({
      editor: local.editor as never,
      getDocumentKey: () => 'local.md',
      getPreferences: noConsent,
      monaco: local.monaco as never,
      requestCompletion: localRequest,
      resolveProviderLocality: vi.fn().mockResolvedValue('local'),
    })
    remote.complete()
    local.complete()

    await vi.advanceTimersByTimeAsync(250)
    expect(remoteRequest).not.toHaveBeenCalled()
    expect(localRequest).toHaveBeenCalledOnce()
  })
})
