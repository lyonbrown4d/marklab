import { TextSelection } from '@milkdown/kit/prose/state'
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

const optionsWith = (
  requestCompletion: AiInlineCompletionOptions['requestCompletion'] = vi
    .fn()
    .mockResolvedValue(' next'),
): AiInlineCompletionOptions => ({
  canComplete: () => true,
  debounceMs: 10,
  enabled: () => true,
  requestCompletion,
})

const deferredCompletion = () => {
  let resolve: ((value: string) => void) | undefined
  let signal: AbortSignal | undefined
  const request = vi.fn((_context, _excluded, nextSignal: AbortSignal) => {
    signal = nextSignal
    return new Promise<string>((nextResolve) => {
      resolve = nextResolve
    })
  })
  return {
    request,
    resolve: (value: string) => resolve?.(value),
    signal: () => signal,
  }
}

describe('AI inline completion plugin lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    document.body.replaceChildren()
  })

  it.each([
    { canComplete: () => false, enabled: () => true, label: 'context policy' },
    { canComplete: () => true, enabled: () => false, label: 'feature toggle' },
  ])('does not request when disabled by $label', async ({ canComplete, enabled }) => {
    const requestCompletion = vi.fn().mockResolvedValue(' next')
    createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...optionsWith(requestCompletion),
        canComplete,
        enabled,
      }),
    ])

    await settleInlineCompletion()
    expect(requestCompletion).not.toHaveBeenCalled()
  })

  it('does not request or capture Tab inside a table', async () => {
    const requestCompletion = vi.fn().mockResolvedValue(' next')
    const cell = inlineCompletionTestSchema.node('table_cell', null, [testParagraph('cell')])
    const doc = inlineCompletionTestSchema.node('doc', null, [
      inlineCompletionTestSchema.node('table', null, [
        inlineCompletionTestSchema.node('table_row', null, [cell]),
      ]),
    ])
    const { view } = createInlineCompletionTestView(
      [createAiInlineCompletionProsePlugin(optionsWith(requestCompletion))],
      doc,
    )

    await settleInlineCompletion()
    expect(requestCompletion).not.toHaveBeenCalled()
    expect(pressInlineCompletionKey(view, 'Tab')).toBe(false)
    expect(pressInlineCompletionKey(view, 'j', { ctrlKey: true })).toBe(false)
  })

  it('cancels scheduling while read-only or composing', async () => {
    const requestCompletion = vi.fn().mockResolvedValue(' next')
    const readonly = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(optionsWith(requestCompletion)),
    ])
    readonly.view.setProps({ editable: () => false })
    const composing = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(optionsWith(requestCompletion)),
    ])
    composing.view.dom.dispatchEvent(new CompositionEvent('compositionstart'))

    await settleInlineCompletion()
    expect(requestCompletion).not.toHaveBeenCalled()
  })

  it('never renders a document candidate in a read-only editor', async () => {
    const doc = inlineCompletionTestSchema.node('doc', null, [testParagraph('I plan')])
    const { view } = createInlineCompletionTestView(
      [
        createAiInlineCompletionProsePlugin({
          ...optionsWith(),
          getDocumentCompletions: () => [{ source: 'document', text: ' locally' }],
        }),
      ],
      doc,
      false,
    )
    await Promise.resolve()

    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })

  it('aborts and ignores a stale request after new input', async () => {
    const deferred = deferredCompletion()
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(optionsWith(deferred.request)),
    ])
    await settleInlineCompletion()
    expect(deferred.request).toHaveBeenCalledTimes(1)

    view.dispatch(view.state.tr.insertText('!'))
    deferred.resolve(' stale')
    await Promise.resolve()
    await Promise.resolve()

    expect(deferred.signal()?.aborted).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })

  it('aborts a pending request on Escape so its result cannot revive', async () => {
    const deferred = deferredCompletion()
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(optionsWith(deferred.request)),
    ])
    await settleInlineCompletion()

    expect(pressInlineCompletionKey(view, 'Escape')).toBe(false)
    deferred.resolve(' revived')
    await Promise.resolve()
    await Promise.resolve()

    expect(deferred.signal()?.aborted).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })

  it('reacts to runtime enabled changes and does not commit an ineligible result', async () => {
    const deferred = deferredCompletion()
    let enabled = true
    let notifyEnabled = () => {}
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...optionsWith(deferred.request),
        enabled: () => enabled,
        getDocumentCompletions: () => [{ source: 'document', text: ' local' }],
        subscribeEnabled: (listener) => {
          notifyEnabled = listener
          return () => {}
        },
      }),
    ])
    await Promise.resolve()
    await settleInlineCompletion()
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' local')

    enabled = false
    notifyEnabled()
    deferred.resolve(' revived')
    await Promise.resolve()
    await Promise.resolve()

    expect(deferred.signal()?.aborted).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()

    enabled = true
    notifyEnabled()
    await Promise.resolve()
    expect(view.dom.querySelector('.marklab-ai-ghost-text')?.textContent).toBe(' local')
  })

  it('rechecks context eligibility before committing an async result', async () => {
    const deferred = deferredCompletion()
    let eligible = true
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...optionsWith(deferred.request),
        canComplete: () => eligible,
      }),
    ])
    await settleInlineCompletion()

    eligible = false
    deferred.resolve(' ineligible')
    await Promise.resolve()
    await Promise.resolve()

    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })

  it('clears candidates when the editor becomes read-only', async () => {
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...optionsWith(),
        getDocumentCompletions: () => [{ source: 'document', text: ' local' }],
      }),
    ])
    await Promise.resolve()
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).not.toBeNull()

    view.setProps({ editable: () => false })

    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
    expect(pressInlineCompletionKey(view, 'Tab')).toBe(false)
  })

  it('does not accept a candidate while composing', async () => {
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...optionsWith(),
        getDocumentCompletions: () => [{ source: 'document', text: ' local' }],
      }),
    ])
    await Promise.resolve()
    Object.defineProperty(view, 'composing', { configurable: true, get: () => true })

    expect(pressInlineCompletionKey(view, 'Tab')).toBe(false)
    expect(view.state.doc.textContent).toBe('I plan')
  })

  it('aborts pending work when the editor is destroyed', async () => {
    const deferred = deferredCompletion()
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(optionsWith(deferred.request)),
    ])
    await settleInlineCompletion()

    view.destroy()
    expect(deferred.signal()?.aborted).toBe(true)
  })

  it('clears stale work when the document key changes', async () => {
    const deferred = deferredCompletion()
    let documentKey = 'notes/a.md'
    let notifyPathChange = () => {}
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin({
        ...optionsWith(deferred.request),
        getDocumentKey: () => documentKey,
        subscribeDocumentKey: (listener) => {
          notifyPathChange = listener
          return () => {}
        },
      }),
    ])
    await settleInlineCompletion()

    documentKey = 'notes/b.md'
    notifyPathChange()
    deferred.resolve(' stale')
    await Promise.resolve()

    expect(deferred.signal()?.aborted).toBe(true)
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })

  it('cancels a suggestion when the selection moves', async () => {
    const { view } = createInlineCompletionTestView([
      createAiInlineCompletionProsePlugin(optionsWith()),
    ])
    await settleInlineCompletion()
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).not.toBeNull()

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
    expect(view.dom.querySelector('.marklab-ai-ghost-text')).toBeNull()
  })
})
