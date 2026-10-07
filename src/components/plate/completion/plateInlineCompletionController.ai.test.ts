import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlateInlineCompletionController } from '@/components/plate/completion/plateInlineCompletionController'
import {
  createCompletionEditor,
  deferredCompletion,
  settleCompletion,
} from '@/components/plate/completion/plateInlineCompletionController.testUtils'

describe('Plate inline AI completion', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows one AI ghost only when the document index has no candidate', async () => {
    const editor = createCompletionEditor()
    const requestCompletion = vi.fn(async () => [
      { source: 'ai' as const, text: ' tomorrow' },
      { source: 'ai' as const, text: ' next week' },
    ])
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 20,
      enabled: () => true,
      getDocumentCompletions: () => [],
      requestCompletion,
    })

    controller.sync()
    await vi.advanceTimersByTimeAsync(20)

    expect(requestCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ before: 'I plan to' }),
      [],
      expect.any(AbortSignal),
    )
    expect(controller.getSnapshot()).toEqual({
      anchor: { path: [0, 0], offset: 9 },
      candidates: [],
      completion: { source: 'ai', text: ' tomorrow' },
      kind: 'ai',
    })
    controller.destroy()
  })

  it.each([
    ['empty', async () => null],
    ['failure', async () => Promise.reject(new Error('offline'))],
  ])('keeps no state after an AI %s response', async (_label, requestCompletion) => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 20,
      enabled: () => true,
      requestCompletion,
    })

    controller.sync()
    await vi.advanceTimersByTimeAsync(20)

    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it('aborts and ignores a response made stale by a caret change', async () => {
    const editor = createCompletionEditor()
    const pending = deferredCompletion()
    const requestSignals: AbortSignal[] = []
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 20,
      enabled: () => true,
      requestCompletion: (_context, _excluded, signal) => {
        requestSignals.push(signal)
        return pending.promise
      },
    })
    controller.sync()
    await vi.advanceTimersByTimeAsync(20)

    editor.tf.select({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    })
    controller.sync()
    expect(requestSignals[0]?.aborted).toBe(true)
    pending.resolve(' stale')
    await settleCompletion()

    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it('does not intercept menu keys for an AI ghost', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 0,
      enabled: () => true,
      requestCompletion: async () => ' tomorrow',
    })
    controller.sync()
    await vi.advanceTimersByTimeAsync(0)

    for (const key of ['ArrowDown', 'ArrowUp', 'Enter']) {
      const event = new KeyboardEvent('keydown', { cancelable: true, key })
      expect(controller.keyDown(event)).toBe(false)
      expect(event.defaultPrevented).toBe(false)
    }
    controller.destroy()
  })

  it('partially accepts an AI ghost with Ctrl+Right', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 0,
      enabled: () => true,
      requestCompletion: async () => ' write notes tomorrow',
    })
    controller.sync()
    await vi.advanceTimersByTimeAsync(0)

    const event = new KeyboardEvent('keydown', {
      cancelable: true,
      ctrlKey: true,
      key: 'ArrowRight',
    })
    expect(controller.keyDown(event)).toBe(true)
    expect(event.defaultPrevented).toBe(true)
    expect(editor.api.string([])).toBe('I plan to write')
    controller.destroy()
  })

  it('dismisses an AI ghost with Escape and accepts it with Tab', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 0,
      enabled: () => true,
      requestCompletion: async () => ' tomorrow',
    })
    controller.sync()
    await vi.advanceTimersByTimeAsync(0)

    const escape = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' })
    expect(controller.keyDown(escape)).toBe(true)
    expect(controller.getSnapshot()).toBeNull()

    controller.sync()
    await vi.advanceTimersByTimeAsync(0)
    const tab = new KeyboardEvent('keydown', { cancelable: true, key: 'Tab' })
    expect(controller.keyDown(tab)).toBe(true)
    expect(tab.defaultPrevented).toBe(true)
    expect(editor.api.string([])).toBe('I plan to tomorrow')
    controller.destroy()
  })

  it('exposes ghost-only decoration for AI completion', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 0,
      enabled: () => true,
      requestCompletion: async () => ' tomorrow',
    })
    controller.sync()
    await vi.advanceTimersByTimeAsync(0)

    const decorations = controller.decorate([editor.children[0]!.children[0]!, [0, 0]])
    expect(decorations).toEqual([
      expect.objectContaining({
        plateInlineCompletion: ' tomorrow',
        plateInlineCompletionAccept: expect.any(Function),
        plateInlineCompletionKind: 'ai',
      }),
    ])
    expect(decorations[0]).not.toHaveProperty('plateInlineCompletionCandidates')
    controller.destroy()
  })
})
