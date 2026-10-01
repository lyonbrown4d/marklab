import { history } from '@milkdown/kit/prose/history'
import { Schema } from '@milkdown/kit/prose/model'
import { EditorState, TextSelection } from '@milkdown/kit/prose/state'
import { EditorView } from '@milkdown/kit/prose/view'
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiGenerationEvent } from '@/services/aiApi'
import { useInlineAiComposer } from '@/components/milkdown/useInlineAiComposer'

const apiMock = vi.hoisted(() => ({
  cancelGeneration: vi.fn(),
  listProviders: vi.fn(),
  localStatus: vi.fn(),
  onGenerationEvent: vi.fn(),
  startGeneration: vi.fn(),
}))

vi.mock('@/services/aiApi', () => ({ aiApi: apiMock }))

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    text: { group: 'inline' },
  },
})

const messages = {
  defaultProviderUnavailable: 'The selected AI provider is unavailable',
  noProvider: 'Configure an AI provider',
  quickActionInstructions: {
    concise: 'Make this concise',
    explain: 'Explain this',
    rewrite: 'Rewrite this',
  },
  staleSelection: 'The editor changed',
}

describe('useInlineAiComposer', () => {
  let eventHandler: ((event: AiGenerationEvent) => void) | null
  let root: HTMLDivElement
  let view: EditorView

  beforeEach(() => {
    Object.defineProperty(window, 'scrollBy', { configurable: true, value: vi.fn() })
    eventHandler = null
    apiMock.cancelGeneration.mockReset().mockResolvedValue(undefined)
    apiMock.listProviders.mockReset().mockResolvedValue([
      {
        id: 'openai-main',
        label: 'OpenAI',
        kind: 'openai',
        model: 'gpt-5-mini',
        hasApiKey: true,
        apiKeySource: 'stored',
        maskedApiKey: '••••••••',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    apiMock.localStatus.mockReset().mockResolvedValue({
      runtime: 'idle',
      activeModelId: null,
      models: [],
    })
    apiMock.onGenerationEvent.mockReset().mockImplementation(async (handler) => {
      eventHandler = handler
      return vi.fn()
    })
    apiMock.startGeneration.mockReset().mockResolvedValue({ requestId: 'request-1' })

    root = document.createElement('div')
    root.className = 'crepe'
    document.body.append(root)
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('Original paragraph')),
    ])
    view = new EditorView(root, {
      state: EditorState.create({ doc, plugins: [history()] }),
      dispatchTransaction: (transaction) => view.updateState(view.state.apply(transaction)),
    })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 9)))
    vi.spyOn(view, 'coordsAtPos').mockReturnValue({ left: 20, right: 20, top: 20, bottom: 40 })
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      right: 800,
      top: 0,
      bottom: 600,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    })
    view.dom.focus()
  })

  afterEach(() => {
    view.destroy()
    root.remove()
  })

  const renderComposer = (
    readOnly = false,
    overrides: Partial<{
      defaultProviderId: string | null
      getEditorView: () => EditorView | null
      ready: boolean
    }> = {},
  ) =>
    renderHook(
      () =>
        useInlineAiComposer({
          activePath: 'notes/a.md',
          defaultProviderId: overrides.defaultProviderId ?? 'openai-main',
          getEditorView: overrides.getEditorView ?? (() => view),
          messages,
          readOnly,
          ready: overrides.ready ?? true,
          rootRef: { current: root },
        }),
      { wrapper: StrictMode },
    )

  it('resolves a provider after StrictMode replay and streams a proposal', async () => {
    const { result } = renderComposer()

    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('prompt'))
    expect(result.current.isOpen).toBe(true)
    expect(result.current.sourceText).toBe('Original')
    expect(result.current.modelLabel).toBe('OpenAI · gpt-5-mini')

    await act(() => result.current.submit('Make it clearer'))
    expect(apiMock.startGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'openai-main',
        prompt: expect.stringContaining('Original'),
      }),
    )
    act(() => {
      eventHandler?.({ requestId: 'request-1', type: 'delta', delta: 'Clear' })
      eventHandler?.({
        requestId: 'request-1',
        type: 'finish',
        finishReason: 'stop',
        usage: {},
        warnings: [],
      })
    })
    expect(result.current.phase).toBe('proposal')
    expect(result.current.proposal).toBe('Clear')
  })

  it('does not open while read-only or when focus has left the editor', () => {
    const readOnly = renderComposer(true)
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    expect(readOnly.result.current.isOpen).toBe(false)
    readOnly.unmount()

    const editable = renderComposer()
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    expect(editable.result.current.isOpen).toBe(false)
    input.remove()
  })

  it('surfaces a no-provider error and never starts generation', async () => {
    apiMock.listProviders.mockResolvedValue([])
    const { result } = renderComposer()

    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error).toBe(messages.defaultProviderUnavailable)
    await act(() => result.current.submit('Rewrite'))
    expect(apiMock.startGeneration).not.toHaveBeenCalled()
  })

  it('cancels an active generation when dismissed', async () => {
    const { result } = renderComposer()
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('prompt'))
    await act(() => result.current.submit('Rewrite'))

    act(() => result.current.dismiss())

    expect(result.current.isOpen).toBe(false)
    expect(apiMock.cancelGeneration).toHaveBeenCalledWith('request-1')
  })

  it('cancels an active generation and removes its listener when unmounted', async () => {
    const unlisten = vi.fn()
    apiMock.onGenerationEvent.mockImplementation(async (handler) => {
      eventHandler = handler
      return unlisten
    })
    const { result, unmount } = renderComposer()
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('prompt'))
    await act(() => result.current.submit('Rewrite'))

    unmount()

    expect(apiMock.cancelGeneration).toHaveBeenCalledWith('request-1')
    expect(unlisten).toHaveBeenCalled()
  })

  it('cancels an active generation before opening a fresh selection', async () => {
    const { result } = renderComposer()
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('prompt'))
    await act(() => result.current.submit('Rewrite'))

    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })

    expect(apiMock.cancelGeneration).toHaveBeenCalledWith('request-1')
  })

  it('cleans a listener that resolves after the hook unmounts', async () => {
    const unlisten = vi.fn()
    let resolveListener: ((value: () => void) => void) | null = null
    apiMock.onGenerationEvent.mockImplementation(
      () => new Promise((resolve) => (resolveListener = resolve)),
    )
    const { unmount } = renderComposer()
    unmount()
    await act(async () => resolveListener?.(unlisten))
    expect(unlisten).toHaveBeenCalledOnce()
  })

  it('does not fall back when the explicit default provider query fails', async () => {
    apiMock.listProviders.mockRejectedValue(new Error('provider query failed'))
    apiMock.localStatus.mockResolvedValue({
      runtime: 'ready',
      activeModelId: 'local-model',
      models: [
        {
          id: 'local-model',
          label: 'Local model',
          sizeBytes: 1,
          license: 'MIT',
          installed: true,
          active: true,
          recommended: true,
        },
      ],
    })
    const { result } = renderComposer()

    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('error'))
    expect(result.current.error).toBe(messages.defaultProviderUnavailable)
    expect(result.current.modelLabel).toBe('')
  })

  it('cancels and closes when the editor becomes read-only or is rebuilt', async () => {
    let currentView: EditorView | null = view
    const { result, rerender } = renderHook(
      ({ readOnly }) =>
        useInlineAiComposer({
          activePath: 'notes/a.md',
          defaultProviderId: 'openai-main',
          getEditorView: () => currentView,
          messages,
          readOnly,
          ready: true,
          rootRef: { current: root },
        }),
      { initialProps: { readOnly: false } },
    )
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('prompt'))
    await act(() => result.current.submit('Rewrite'))

    rerender({ readOnly: true })
    await waitFor(() => expect(result.current.isOpen).toBe(false))
    expect(apiMock.cancelGeneration).toHaveBeenCalledWith('request-1')

    rerender({ readOnly: false })
    view.dom.focus()
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('prompt'))
    currentView = null
    rerender({ readOnly: false })
    await waitFor(() => expect(result.current.isOpen).toBe(false))
  })

  it('restores editor focus after dismissing the panel', async () => {
    const focus = vi.spyOn(view, 'focus')
    const { result } = renderComposer()
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('prompt'))
    focus.mockClear()

    act(() => result.current.dismiss())

    expect(focus).toHaveBeenCalledOnce()
  })

  it('batches burst deltas and flushes them before a terminal event', async () => {
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1)
    const { result } = renderComposer()
    fireEvent.keyDown(view.dom, { key: 'j', ctrlKey: true })
    await waitFor(() => expect(result.current.phase).toBe('prompt'))
    await act(() => result.current.submit('Rewrite'))

    act(() => {
      eventHandler?.({ requestId: 'request-1', type: 'delta', delta: 'A' })
      eventHandler?.({ requestId: 'request-1', type: 'delta', delta: 'B' })
      eventHandler?.({ requestId: 'request-1', type: 'delta', delta: 'C' })
    })
    expect(requestFrame).toHaveBeenCalledOnce()
    expect(result.current.proposal).toBe('')
    act(() =>
      eventHandler?.({
        requestId: 'request-1',
        type: 'finish',
        finishReason: 'stop',
        usage: {},
        warnings: [],
      }),
    )
    expect(result.current.proposal).toBe('ABC')
    expect(result.current.phase).toBe('proposal')
  })
})
