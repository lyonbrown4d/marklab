import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlateEditor } from 'platejs/react'
import { usePlateInlineAiComposer } from '@/components/plate/usePlateInlineAiComposer'
import type { AiGenerationEvent } from '@/services/aiApi'

const aiMock = vi.hoisted(() => ({
  handler: null as ((event: AiGenerationEvent) => void) | null,
  cancelGeneration: vi.fn(),
  listProviders: vi.fn(),
  onGenerationEvent: vi.fn(),
  startGeneration: vi.fn(),
  unlisten: vi.fn(),
}))

vi.mock('@/services/aiApi', () => ({ aiApi: aiMock }))
vi.mock('@/components/plate/plateAiSelection', () => ({
  capturePlateAiSelection: (editor: PlateEditor, documentPath: string) => ({
    anchor: { left: 8, top: 8 },
    documentPath,
    editor,
    sourceText: 'Original',
  }),
  isPlateAiSelectionCaptureUsable: () => true,
  applyPlateAiReplacement: vi.fn(),
}))

const editor = {} as PlateEditor
const getEditor = () => editor
const messages = {
  defaultProviderUnavailable: 'Provider unavailable',
  noProvider: 'No provider',
  quickActionInstructions: { rewrite: 'Rewrite', concise: 'Shorten', explain: 'Explain' },
  staleSelection: 'Selection changed',
}
const initialProps = { activePath: 'a.md', readOnly: false, ready: true }
const renderComposer = (defaultProviderId: string | null = null) => {
  const rootRef = { current: document.createElement('div') }
  return renderHook(
    (props: typeof initialProps) =>
      usePlateInlineAiComposer({
        ...props,
        defaultProviderId,
        getEditor,
        messages,
        rootRef,
        shortcutOverrides: {},
      }),
    { initialProps },
  )
}
const finish = (requestId: string): AiGenerationEvent => ({
  requestId,
  type: 'finish',
  finishReason: 'stop',
  usage: {},
  warnings: [],
})
const deferredStart = () => {
  let resolve: (value: { requestId: string }) => void = () => undefined
  const promise = new Promise<{ requestId: string }>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe('usePlateInlineAiComposer startup event ordering', () => {
  it('recovers from an unavailable default when a usable provider is selected', async () => {
    const { result } = renderComposer('missing-provider')
    await act(async () => result.current.open())
    expect(result.current.error).toBe(messages.defaultProviderUnavailable)
    act(() => result.current.setProviderId('provider-1'))
    expect(result.current.providerId).toBe('provider-1')
    expect(result.current.phase).toBe('prompt')
    expect(result.current.error).toBeNull()
  })

  it('shows provider-loading failures instead of reporting an empty configuration', async () => {
    aiMock.listProviders.mockRejectedValueOnce(new Error('Provider storage unavailable'))
    const { result } = renderComposer()
    await act(async () => result.current.open())
    expect(result.current.phase).toBe('error')
    expect(result.current.error).toBe('Provider storage unavailable')
    expect(aiMock.startGeneration).not.toHaveBeenCalled()
  })

  it.each([
    { readOnly: true, ready: true },
    { readOnly: false, ready: false },
  ])('does not open or load providers for an unavailable editor: %j', async (availability) => {
    const { result, rerender } = renderComposer()
    rerender({ activePath: 'a.md', ...availability })
    await act(async () => result.current.open())
    expect(result.current.isOpen).toBe(false)
    expect(aiMock.listProviders).not.toHaveBeenCalled()
  })

  beforeEach(() => {
    vi.resetAllMocks()
    aiMock.handler = null
    aiMock.cancelGeneration.mockResolvedValue(undefined)
    aiMock.listProviders.mockResolvedValue([
      { id: 'provider-1', label: 'Provider', model: 'Model', locality: 'remote', available: true },
    ])
    aiMock.onGenerationEvent.mockImplementation(async (handler: typeof aiMock.handler) => {
      aiMock.handler = handler
      return aiMock.unlisten
    })
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  it.each(['finish', 'error'] as const)(
    'keeps the early %s terminal phase after IPC acknowledgement',
    async (type) => {
      aiMock.startGeneration.mockImplementation(async () => {
        aiMock.handler?.({ requestId: 'other', type: 'delta', delta: 'wrong' })
        aiMock.handler?.({ requestId: 'current', type: 'delta', delta: 'Replacement' })
        aiMock.handler?.(
          type === 'finish'
            ? finish('current')
            : { requestId: 'current', type, message: 'Provider unavailable' },
        )
        return { requestId: 'current' }
      })
      const { result } = renderComposer()
      await act(async () => result.current.open())
      await act(async () => result.current.submit('Rewrite'))
      expect(result.current.proposal).toBe('Replacement')
      expect(result.current.phase).toBe(type === 'finish' ? 'proposal' : 'error')
      expect(result.current.error).toBe(type === 'error' ? 'Provider unavailable' : null)
    },
  )

  it.each(['stop', 'path', 'readonly', 'not-ready', 'unmount'] as const)(
    'cancels a pending acknowledgement on %s and discards its early events',
    async (action) => {
      const start = deferredStart()
      aiMock.startGeneration.mockReturnValue(start.promise)
      const { result, rerender, unmount } = renderComposer()
      await act(async () => result.current.open())
      let pending: Promise<void> | undefined
      act(() => {
        pending = result.current.submit('Rewrite')
      })
      await waitFor(() => expect(aiMock.startGeneration).toHaveBeenCalledOnce())
      act(() => {
        aiMock.handler?.({ requestId: 'old', type: 'delta', delta: 'stale' })
        if (action === 'stop') result.current.stop()
        else if (action === 'unmount') unmount()
        else
          rerender({
            ...initialProps,
            activePath: action === 'path' ? 'b.md' : 'a.md',
            readOnly: action === 'readonly',
            ready: action !== 'not-ready',
          })
      })
      await act(async () => {
        start.resolve({ requestId: 'old' })
        await pending
      })
      expect(aiMock.cancelGeneration).toHaveBeenCalledExactlyOnceWith('old')
      expect(result.current.proposal).toBe('')
      if (action !== 'unmount') expect(result.current.phase).toBe('prompt')
    },
  )

  it('blocks duplicate starts and prevents an old acknowledgement from clearing a newer startup', async () => {
    const old = deferredStart()
    const current = deferredStart()
    aiMock.startGeneration.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const { result } = renderComposer()
    await act(async () => result.current.open())
    let first: Promise<void> | undefined
    let second: Promise<void> | undefined
    act(() => {
      first = result.current.submit('Rewrite')
      void result.current.submit('Duplicate')
    })
    await waitFor(() => expect(aiMock.startGeneration).toHaveBeenCalledOnce())
    act(() => {
      result.current.stop()
      second = result.current.submit('New rewrite')
    })
    await waitFor(() => expect(aiMock.startGeneration).toHaveBeenCalledTimes(2))
    await act(async () => {
      aiMock.handler?.({ requestId: 'old', type: 'delta', delta: 'stale' })
      aiMock.handler?.({ requestId: 'current', type: 'delta', delta: 'fresh' })
      aiMock.handler?.(finish('current'))
      old.resolve({ requestId: 'old' })
      await first
      current.resolve({ requestId: 'current' })
      await second
    })
    expect(result.current.proposal).toBe('fresh')
    expect(result.current.phase).toBe('proposal')
    expect(aiMock.cancelGeneration).toHaveBeenCalledExactlyOnceWith('old')
  })

  it('cancels the acknowledged job and reports an explicit error when startup buffering overflows', async () => {
    aiMock.startGeneration.mockImplementation(async () => {
      aiMock.handler?.({ requestId: 'current', type: 'delta', delta: 'x'.repeat(256 * 1_024) })
      aiMock.handler?.(finish('current'))
      return { requestId: 'current' }
    })
    const { result } = renderComposer()
    await act(async () => result.current.open())
    await act(async () => result.current.submit('Rewrite'))
    expect(result.current.phase).toBe('error')
    expect(result.current.error).toContain('buffer limit')
    expect(result.current.proposal).toBe('')
    expect(aiMock.cancelGeneration).toHaveBeenCalledExactlyOnceWith('current')
  })

  it('cancels an active generation on unmount', async () => {
    aiMock.startGeneration.mockResolvedValue({ requestId: 'current' })
    const { result, unmount } = renderComposer()
    await act(async () => result.current.open())
    await act(async () => result.current.submit('Rewrite'))
    unmount()
    expect(aiMock.cancelGeneration).toHaveBeenCalledExactlyOnceWith('current')
    expect(aiMock.unlisten).toHaveBeenCalledOnce()
  })

  it('does not launch a cancelled request when listener setup finishes late', async () => {
    let resolveListener: (value: () => void) => void = () => undefined
    const listener = new Promise<() => void>((resolve) => {
      resolveListener = resolve
    })
    aiMock.onGenerationEvent.mockReturnValueOnce(listener)
    const { result } = renderComposer()
    await act(async () => result.current.open())
    let pending: Promise<void> | undefined
    act(() => {
      pending = result.current.submit('Rewrite')
      result.current.stop()
    })
    await act(async () => {
      resolveListener(aiMock.unlisten)
      await pending
    })
    expect(result.current.phase).toBe('prompt')
    expect(aiMock.startGeneration).not.toHaveBeenCalled()
  })

  it('clears the startup guard after a failed start so retry can complete', async () => {
    aiMock.startGeneration
      .mockRejectedValueOnce(new Error('Start failed'))
      .mockImplementationOnce(async () => {
        aiMock.handler?.(finish('retry'))
        return { requestId: 'retry' }
      })
    const { result } = renderComposer()
    await act(async () => result.current.open())
    await act(async () => result.current.submit('Rewrite'))
    expect(result.current.phase).toBe('error')
    await act(async () => result.current.submit('Retry'))
    expect(result.current.phase).toBe('proposal')
  })
})
