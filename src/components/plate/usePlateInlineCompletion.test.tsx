import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlateInlineCompletion } from '@/components/plate/usePlateInlineCompletion'
import { requestAiInlineCompletion } from '@/services/aiInlineCompletionRequest'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const routeCache = vi.hoisted(() => ({ active: true, cacheKey: '' }))

vi.mock('keepalive-for-react', () => ({
  useKeepAliveContext: () => routeCache,
}))

vi.mock('@/services/aiInlineCompletionRequest', () => ({
  requestAiInlineCompletion: vi.fn(async () => ' tomorrow'),
}))

const createEditor = (text: string) => {
  const editor = createPlateEditor({
    value: [{ type: 'p', children: [{ text }] }],
  })
  editor.tf.select({
    anchor: { path: [0, 0], offset: text.length },
    focus: { path: [0, 0], offset: text.length },
  })
  return editor
}

describe('usePlateInlineCompletion', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    routeCache.active = true
    routeCache.cacheKey = ''
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
    vi.mocked(requestAiInlineCompletion).mockClear()
  })
  afterEach(() => vi.useRealTimers())

  it('indexes the current Markdown and exposes a local candidate', async () => {
    const editor = createEditor('I plan to')
    const value = 'I plan to review the notes tomorrow.\n\nI plan to'
    const { result } = renderHook(() =>
      usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
    )

    await act(async () => vi.advanceTimersByTimeAsync(200))

    expect(result.current.state?.candidates[0]).toMatchObject({
      source: 'document',
      text: ' review the notes tomorrow.',
    })
    expect(result.current.renderLeaf).toBeTypeOf('function')
  })

  it('uses the configured provider and AI request preferences', async () => {
    usePreferencesStore.setState({
      aiCompletionEnabled: true,
      aiCompletionCloudContextConsent: true,
      aiCompletionLength: 'long',
      aiCompletionNearbyContextEnabled: false,
      aiCompletionProviderId: 'openai-main',
      documentCompletionEnabled: false,
    })
    const editor = createEditor('I plan to')
    renderHook(() =>
      usePlateInlineCompletion({
        activePath: 'note.md',
        editor,
        readOnly: false,
        value: 'I plan to',
      }),
    )

    await act(async () => vi.advanceTimersByTimeAsync(800))

    expect(requestAiInlineCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        completionSessionId: expect.any(String),
        length: 'long',
        prefix: 'I plan to',
        providerId: 'openai-main',
      }),
      expect.any(AbortSignal),
    )
  })

  it('cancels and clears completion when preferences disable it', async () => {
    const editor = createEditor('I plan to')
    const value = 'I plan to review notes.\n\nI plan to'
    const { result } = renderHook(() =>
      usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
    )
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(result.current.state).not.toBeNull()

    act(() => usePreferencesStore.getState().setDocumentCompletionEnabled(false))
    expect(result.current.state).toBeNull()
  })

  it('defers value-change completion work until after the next paint', async () => {
    const editor = createEditor('I plan to')
    const value = 'I plan to review notes.\n\nI plan to'
    const { result } = renderHook(() =>
      usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
    )
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(result.current.state).not.toBeNull()
    editor.selection = null

    act(() => result.current.onEditorChange())

    expect(result.current.state).not.toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(20))
    expect(result.current.state).toBeNull()
  })

  it('clears suggestions while its cached route is inactive and resumes on return', async () => {
    const editor = createEditor('I plan to')
    const value = 'I plan to review notes.\n\nI plan to'
    const { result, rerender } = renderHook(() =>
      usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
    )
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(result.current.state).not.toBeNull()

    act(() => {
      routeCache.cacheKey = 'cache:note.md'
      routeCache.active = false
      rerender()
    })
    expect(result.current.state).toBeNull()

    act(() => {
      routeCache.active = true
      rerender()
    })
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(result.current.state).not.toBeNull()
  })
})
