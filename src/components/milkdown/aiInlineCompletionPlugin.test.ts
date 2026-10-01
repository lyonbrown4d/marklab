import { undo } from '@milkdown/kit/prose/history'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createAiInlineCompletionProsePlugin,
  type AiInlineCompletionOptions,
} from '@/components/milkdown/aiInlineCompletionPlugin'
import {
  createInlineCompletionTestView,
  inlineCompletionTestSchema,
  pressInlineCompletionKey,
  settleInlineCompletion,
  testParagraph,
} from '@/components/milkdown/aiInlineCompletionTestUtils'

const createOptions = (
  result: string | readonly string[] = ' to write',
): AiInlineCompletionOptions => ({
  canComplete: () => true,
  debounceMs: 10,
  enabled: () => true,
  requestCompletion: vi.fn().mockResolvedValue(result),
})

describe('AI inline completion plugin interactions', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it('renders accessible-safe ghost text without changing the document', async () => {
    const original = 'I plan'
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(createOptions()),
    ])

    await settleInlineCompletion()

    const ghost = view.dom.querySelector<HTMLElement>('.marklab-ai-ghost-text')
    expect(view.state.doc.textContent).toBe(original)
    expect(ghost?.textContent).toBe(' to write')
    expect(ghost?.getAttribute('aria-hidden')).toBe('true')
    expect(ghost?.contentEditable).toBe('false')
  })

  it('shows document candidates immediately and appends AI candidates without replacing them', async () => {
    let resolveAi: ((value: { source: 'ai'; text: string }) => void) | undefined
    const requestCompletion = vi.fn(
      () =>
        new Promise<{ source: 'ai'; text: string }>((resolve) => {
          resolveAi = resolve
        }),
    )
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...createOptions(),
        getDocumentCompletions: () => [{ source: 'document', text: ' locally' }],
        requestCompletion,
      }),
    ])

    await Promise.resolve()
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' locally')
    await settleInlineCompletion()
    expect(requestCompletion).toHaveBeenCalledWith(
      expect.any(Object),
      [' locally'],
      expect.any(AbortSignal),
    )
    resolveAi?.({ source: 'ai', text: ' with AI' })
    await Promise.resolve()
    await Promise.resolve()

    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' locally')
    expect(pressInlineCompletionKey(view, ']', { altKey: true })).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' with AI')
  })

  it('uses local-only context before debounce and bounded nearby context for AI', async () => {
    const localContexts: unknown[] = []
    const aiContexts: unknown[] = []
    const doc = inlineCompletionTestSchema.node('doc', null, [
      inlineCompletionTestSchema.node(
        'heading',
        { level: 1 },
        inlineCompletionTestSchema.text('Plan'),
      ),
      testParagraph('Previous'),
      testParagraph('I plan'),
    ])
    createInlineCompletionTestView(
      [
        createAiInlineCompletionProsePlugin({
          ...createOptions(),
          getDocumentCompletions: (context) => {
            localContexts.push(context)
            return []
          },
          requestCompletion: vi.fn(async (context) => {
            aiContexts.push(context)
            return null
          }),
        }),
      ],
      doc,
    )

    expect(localContexts).toEqual([
      expect.objectContaining({ heading: null, precedingBlocks: [], followingBlocks: [] }),
    ])
    expect(aiContexts).toEqual([])
    await settleInlineCompletion()
    expect(aiContexts).toEqual([
      expect.objectContaining({ heading: 'Plan', precedingBlocks: ['Previous'] }),
    ])
  })

  it('reserves one candidate slot for AI when document results fill the limit', async () => {
    const requestCompletion = vi.fn().mockResolvedValue({ source: 'ai', text: ' ai' })
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...createOptions(),
        getDocumentCompletions: () => [
          { source: 'document', text: ' local one' },
          { source: 'document', text: ' local two' },
          { source: 'document', text: ' local three' },
        ],
        maxCandidates: 3,
        requestCompletion,
      }),
    ])
    await Promise.resolve()
    await settleInlineCompletion()
    await Promise.resolve()

    expect(requestCompletion).toHaveBeenCalledWith(
      expect.any(Object),
      [' local one', ' local two'],
      expect.any(AbortSignal),
    )
    expect(pressInlineCompletionKey(view, ']', { altKey: true })).toBe(true)
    expect(pressInlineCompletionKey(view, ']', { altKey: true })).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' ai')
  })

  it('does not request another candidate when all slots are full', async () => {
    const requestCompletion = vi.fn().mockResolvedValue([' one', ' two', ' three'])
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({ ...createOptions(), requestCompletion }),
    ])
    await settleInlineCompletion()
    expect(requestCompletion).toHaveBeenCalledTimes(1)

    pressInlineCompletionKey(view, ']', { altKey: true })
    pressInlineCompletionKey(view, ']', { altKey: true })
    pressInlineCompletionKey(view, ']', { altKey: true })
    await Promise.resolve()

    expect(requestCompletion).toHaveBeenCalledTimes(1)
  })

  it('accepts the full suggestion with Tab in one undoable transaction', async () => {
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(createOptions()),
    ])
    await settleInlineCompletion()

    expect(pressInlineCompletionKey(view, 'Tab')).toBe(true)
    expect(view.state.doc.textContent).toBe('I plan to write')
    expect(undo(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.textContent).toBe('I plan')
  })

  it('accepts the next word with Ctrl/Cmd+ArrowRight', async () => {
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(createOptions(' beautiful world')),
    ])
    await settleInlineCompletion()

    expect(pressInlineCompletionKey(view, 'ArrowRight', { ctrlKey: true })).toBe(true)
    expect(view.state.doc.textContent).toBe('I plan beautiful')
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' world')
  })

  it('switches existing candidates and lazily requests a missing next candidate', async () => {
    const requestCompletion = vi
      .fn<AiInlineCompletionOptions['requestCompletion']>()
      .mockResolvedValueOnce([' first', ' second'])
      .mockResolvedValueOnce(' third')
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...createOptions(),
        requestCompletion,
      }),
    ])
    await settleInlineCompletion()

    expect(pressInlineCompletionKey(view, ']', { altKey: true })).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' second')
    expect(pressInlineCompletionKey(view, '[', { altKey: true })).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' first')
    expect(pressInlineCompletionKey(view, ']', { altKey: true })).toBe(true)
    expect(pressInlineCompletionKey(view, ']', { altKey: true })).toBe(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(requestCompletion).toHaveBeenLastCalledWith(
      expect.any(Object),
      [' first', ' second'],
      expect.any(AbortSignal),
    )
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' third')
  })

  it('clears the suggestion with Escape', async () => {
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(createOptions()),
    ])
    await settleInlineCompletion()

    expect(pressInlineCompletionKey(view, 'Escape')).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })

  it('consumes matching typed input and clears on a mismatch', async () => {
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(createOptions(' to write')),
    ])
    await settleInlineCompletion()

    view.dispatch(view.state.tr.insertText(' to'))
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' write')
    view.dispatch(view.state.tr.insertText('!'))
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })
})
