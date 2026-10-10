import { act, renderHook } from '@testing-library/react'
import { createPlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlateInlineCompletion } from '@/components/plate/usePlateInlineCompletion'
import { usePreferencesStore } from '@/store/usePreferencesStore'

const request = vi.hoisted(() =>
  vi.fn<(request: unknown, signal: AbortSignal) => Promise<string>>(async () => ' tomorrow'),
)
vi.mock('@/services/aiInlineCompletionRequest', () => ({ requestAiInlineCompletion: request }))

const setup = () => {
  const editor = createPlateEditor({
    value: [
      { type: 'p', children: [{ text: 'I plan to review notes tomorrow.' }] },
      { type: 'p', children: [{ text: 'I plan to' }] },
    ],
  })
  editor.tf.select({ path: [1, 0], offset: 9 })
  return {
    editor,
    ...renderHook(
      ({ readOnly }) =>
        usePlateInlineCompletion({
          activePath: 'note.md',
          editor,
          readOnly,
          value: 'I plan to review notes tomorrow.\n\nI plan to',
        }),
      { initialProps: { readOnly: false } },
    ),
  }
}

describe('Plate automatic completion scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    request.mockClear()
    usePreferencesStore.setState(usePreferencesStore.getInitialState(), true)
  })
  afterEach(() => vi.useRealTimers())

  it('does not start completion on mount or a caret-only change', async () => {
    const { editor, result } = setup()
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(result.current.state).toBeNull()
    act(() => {
      editor.tf.select({ path: [1, 0], offset: 8 })
      result.current.onSelectionChange()
    })
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(result.current.state).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('restarts the idle period after each input and cancels it on caret movement', async () => {
    const { editor, result } = setup()
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(200))
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(result.current.state).toBeNull()
    act(() => {
      editor.tf.select({ path: [1, 0], offset: 8 })
      result.current.onSelectionChange()
    })
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(result.current.state).toBeNull()
  })

  it('clears visible suggestions on blur and prevents a pending timer from reopening them', async () => {
    const { result } = setup()
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(result.current.state).not.toBeNull()
    act(() => result.current.onBlur())
    expect(result.current.state).toBeNull()
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(100))
    act(() => result.current.onBlur())
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(result.current.state).toBeNull()
  })

  it('cancels pending completion with Escape before a candidate appears', async () => {
    const { result } = setup()
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(100))
    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true })
    act(() => expect(result.current.onKeyDown(event)).toBe(true))
    expect(event.defaultPrevented).toBe(true)
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(result.current.state).toBeNull()
    expect(request).not.toHaveBeenCalled()
  })

  it('aborts an in-flight AI request when completion is suspended', async () => {
    usePreferencesStore.setState({
      aiCompletionEnabled: true,
      aiCompletionCloudContextConsent: true,
      aiCompletionProviderId: 'openai-main',
      documentCompletionEnabled: false,
    })
    let resolve: (text: string) => void = () => undefined
    request.mockImplementationOnce(
      () =>
        new Promise<string>((done) => {
          resolve = done
        }),
    )
    const { result, rerender } = setup()
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(request).toHaveBeenCalledOnce()
    const signal = request.mock.calls[0]![1]
    rerender({ readOnly: true })
    expect(signal.aborted).toBe(true)
    await act(async () => resolve(' stale completion'))
    expect(result.current.state).toBeNull()
    rerender({ readOnly: false })
    await act(async () => vi.advanceTimersByTimeAsync(800))
    expect(result.current.state).toBeNull()
  })
})
