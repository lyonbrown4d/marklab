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

const createEditorWithReference = (reference: string, active: string) => {
  const editor = createPlateEditor({
    value: [
      { id: 'reference', type: 'p', children: [{ text: reference }] },
      { id: 'active', type: 'p', children: [{ text: active }] },
    ],
  })
  editor.tf.select({
    anchor: { path: [1, 0], offset: active.length },
    focus: { path: [1, 0], offset: active.length },
  })
  return editor
}

const createEditorWithBlocks = () => {
  const editor = createPlateEditor({
    value: [
      {
        id: 'reference',
        type: 'p',
        children: [{ text: 'Project notes continue with the release checklist.' }],
      },
      { id: 'active', type: 'p', children: [{ text: 'Project notes continue' }] },
    ],
  })
  editor.tf.select({
    anchor: { path: [1, 0], offset: 'Project notes continue'.length },
    focus: { path: [1, 0], offset: 'Project notes continue'.length },
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
    const editor = createEditorWithReference('I plan to review the notes tomorrow.', 'I plan to')
    const value = 'I plan to review the notes tomorrow.\n\nI plan to'
    const { result } = renderHook(() =>
      usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
    )

    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(400))

    expect(result.current.state?.kind).toBe('document')
    if (result.current.state?.kind !== 'document') throw new Error('Expected document suggestions')
    expect(result.current.state.candidates[0]).toMatchObject({
      source: 'document',
      text: ' review the notes tomorrow.',
    })
    expect(result.current.renderLeaf).toBeTypeOf('function')
  })

  it('hydrates local suggestions from Plate blocks without waiting for Markdown serialization', async () => {
    const editor = createEditorWithBlocks()
    const { result } = renderHook(() =>
      usePlateInlineCompletion({
        activePath: 'note.md',
        editor,
        readOnly: false,
        value: 'stale external snapshot',
      }),
    )

    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(400))

    expect(result.current.state?.kind).toBe('document')
    if (result.current.state?.kind !== 'document') throw new Error('Expected document suggestions')
    expect(result.current.state.candidates[0]).toMatchObject({
      source: 'document',
      text: ' with the release checklist.',
    })
  })

  it('hydrates a newly activated document while the previous value echo is pending', async () => {
    const firstEditor = createEditorWithReference('First notes continue tomorrow.', 'First notes')
    const secondEditor = createEditorWithReference(
      'Second notes continue with the migration plan.',
      'Second notes continue',
    )
    const { result, rerender } = renderHook(
      ({ activePath, editor, value }) =>
        usePlateInlineCompletion({ activePath, editor, readOnly: false, value }),
      {
        initialProps: {
          activePath: 'first.md',
          editor: firstEditor,
          value: 'first snapshot',
        },
      },
    )

    act(() => result.current.onEditorChange())
    rerender({ activePath: 'second.md', editor: secondEditor, value: 'second snapshot' })
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(400))

    expect(result.current.state?.kind).toBe('document')
    if (result.current.state?.kind !== 'document') throw new Error('Expected document suggestions')
    expect(result.current.state.candidates[0]?.text).toBe(' with the migration plan.')
  })

  it('hydrates a same-path history restore while a local value echo is pending', async () => {
    const editor = createEditorWithReference('First notes continue tomorrow.', 'First notes')
    const restored = createEditorWithReference(
      'Restored notes continue with the recovery plan.',
      'Restored notes continue',
    )
    const { result, rerender } = renderHook(
      ({ value }) =>
        usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
      { initialProps: { value: 'first snapshot' } },
    )

    act(() => result.current.onEditorChange())
    editor.children = restored.children
    editor.selection = restored.selection
    rerender({ value: 'restored external snapshot' })
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(400))

    expect(result.current.state?.kind).toBe('document')
    if (result.current.state?.kind !== 'document') throw new Error('Expected document suggestions')
    expect(result.current.state.candidates[0]?.text).toBe(' with the recovery plan.')
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
    const { result } = renderHook(() =>
      usePlateInlineCompletion({
        activePath: 'note.md',
        editor,
        readOnly: false,
        value: 'I plan to',
      }),
    )

    act(() => result.current.onEditorChange())
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
    const editor = createEditorWithReference('I plan to review notes.', 'I plan to')
    const value = 'I plan to review notes.\n\nI plan to'
    const { result } = renderHook(() =>
      usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
    )
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(result.current.state).not.toBeNull()

    act(() => usePreferencesStore.getState().setDocumentCompletionEnabled(false))
    expect(result.current.state).toBeNull()
  })

  it('waits for an input pause and dismisses stale suggestions immediately', async () => {
    const editor = createEditorWithReference('I plan to review notes.', 'I plan to')
    const value = 'I plan to review notes.\n\nI plan to'
    const { result } = renderHook(() =>
      usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
    )
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(result.current.state).toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(200))
    expect(result.current.state).not.toBeNull()
    editor.selection = null

    act(() => result.current.onEditorChange())

    expect(result.current.state).toBeNull()
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(result.current.state).toBeNull()
  })

  it('clears suggestions while its cached route is inactive and resumes on return', async () => {
    const editor = createEditorWithReference('I plan to review notes.', 'I plan to')
    const value = 'I plan to review notes.\n\nI plan to'
    const { result, rerender } = renderHook(() =>
      usePlateInlineCompletion({ activePath: 'note.md', editor, readOnly: false, value }),
    )
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(400))
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
    expect(result.current.state).toBeNull()
    act(() => result.current.onEditorChange())
    await act(async () => vi.advanceTimersByTimeAsync(400))
    expect(result.current.state).not.toBeNull()
  })
})
