import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerMarkdownSourceInlineCompletion } from '@/components/markdownSourceInlineCompletion'
import {
  createSourceCompletionHarness as createHarness,
  sourceCompletionContext as context,
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

    const result = harness
      .provider()
      .provideInlineCompletions(harness.model, harness.position(), context, harness.token)

    expect(harness.monaco.languages.registerInlineCompletionsProvider).toHaveBeenCalledWith(
      'markdown',
      expect.any(Object),
    )
    expect(result.items[0]?.insertText).toBe(' review the notes.')
    expect(harness.editor.addCommand).toHaveBeenCalledTimes(2)
  })

  it('appends a delayed AI candidate and uses a stable completion session id', async () => {
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
    const provider = harness.provider()
    const changed = vi.fn()
    provider.onDidChangeInlineCompletions(changed)

    const initial = provider.provideInlineCompletions(
      harness.model,
      harness.position(),
      context,
      harness.token,
    )
    expect(initial.items).toHaveLength(1)
    expect(requestCompletion).not.toHaveBeenCalled()

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
    const refreshed = provider.provideInlineCompletions(
      harness.model,
      harness.position(),
      context,
      harness.token,
    )
    expect(refreshed.items.map(({ insertText }) => insertText)).toEqual([
      ' review the notes.',
      ' finish the draft',
    ])
  })

  it('cancels and discards AI work after token, version, or path becomes stale', async () => {
    const harness = createHarness()
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
    provider.provideInlineCompletions(harness.model, harness.position(), context, harness.token)
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

    const result = harness
      .provider()
      .provideInlineCompletions(harness.model, harness.position(), context, harness.token)
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

    harness
      .provider()
      .provideInlineCompletions(harness.model, harness.position(), context, harness.token)
    harness.change('I plan to review the notes.\n\nI plan today')
    harness.change('I plan to review the notes.\n\nI plan tomorrow')
    expect(harness.model.getValue).not.toHaveBeenCalled()

    vi.advanceTimersByTime(180)
    expect(harness.model.getValue).toHaveBeenCalledOnce()
  })

  it('reacts to preference subscriptions by cancelling and clearing stale AI suggestions', async () => {
    const harness = createHarness()
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
    provider.provideInlineCompletions(harness.model, harness.position(), context, harness.token)
    await vi.advanceTimersByTimeAsync(250)

    current = { ...current, aiCompletionEnabled: false }
    notifyPreferences()
    resolve(' stale')
    await Promise.resolve()

    expect(signal?.aborted).toBe(true)
    expect(changed).toHaveBeenCalledOnce()
    expect(
      provider.provideInlineCompletions(harness.model, harness.position(), context, harness.token)
        .items,
    ).toHaveLength(1)
    registration.dispose()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('requires consent for remote AI but allows local providers without it', async () => {
    const remote = createHarness()
    const local = createHarness()
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
    remote
      .provider()
      .provideInlineCompletions(remote.model, remote.position(), context, remote.token)
    local.provider().provideInlineCompletions(local.model, local.position(), context, local.token)

    await vi.advanceTimersByTimeAsync(250)
    expect(remoteRequest).not.toHaveBeenCalled()
    expect(localRequest).toHaveBeenCalledOnce()
  })
})
