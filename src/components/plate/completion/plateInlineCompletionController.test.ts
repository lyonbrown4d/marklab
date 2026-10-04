import { createPlateEditor } from 'platejs/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlateInlineCompletionController } from '@/components/plate/completion/plateInlineCompletionController'
import type { PlateInlineCompletionResult } from '@/components/plate/completion/types'

const createEditor = (text = 'I plan to') => {
  const editor = createPlateEditor({
    value: [{ type: 'p', children: [{ text }] }],
  })
  editor.tf.select({
    anchor: { path: [0, 0], offset: text.length },
    focus: { path: [0, 0], offset: text.length },
  })
  return editor
}

const deferred = () => {
  let resolve: (value: PlateInlineCompletionResult) => void = () => undefined
  const promise = new Promise<PlateInlineCompletionResult>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const settleLocal = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('Plate inline completion controller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows a local document candidate without waiting for AI', async () => {
    const editor = createEditor()
    const requestCompletion = vi.fn(async () => ' tomorrow')
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 50,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion,
    })

    controller.sync()
    await settleLocal()

    expect(controller.getSnapshot()).toMatchObject({
      candidates: [{ source: 'document', text: ' write notes' }],
      index: 0,
    })
    expect(requestCompletion).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('adds an AI candidate after the configured debounce', async () => {
    const editor = createEditor()
    const requestCompletion = vi.fn(async () => ({ source: 'ai' as const, text: ' tomorrow' }))
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 40,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion,
    })

    controller.sync()
    await vi.advanceTimersByTimeAsync(40)

    expect(requestCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ before: 'I plan to' }),
      [' write notes'],
      expect.any(AbortSignal),
    )
    expect(controller.getSnapshot()?.candidates).toEqual([
      { source: 'document', text: ' write notes' },
      { source: 'ai', text: ' tomorrow' },
    ])
    controller.destroy()
  })

  it('shows an AI candidate when the document index has no match', async () => {
    const editor = createEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 20,
      enabled: () => true,
      getDocumentCompletions: () => [],
      requestCompletion: async () => ' tomorrow',
    })

    controller.sync()
    await vi.advanceTimersByTimeAsync(20)

    expect(controller.getSnapshot()?.candidates).toEqual([{ source: 'ai', text: ' tomorrow' }])
    controller.destroy()
  })

  it('aborts and ignores a response made stale by a caret change', async () => {
    const editor = createEditor()
    const pending = deferred()
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
    await settleLocal()

    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it('drops a queued local candidate after the document changes', async () => {
    const editor = createEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' stale' }],
      requestCompletion: async () => null,
    })
    controller.sync()
    editor.children = [{ type: 'p', children: [{ text: 'Changed!!' }] }]
    await settleLocal()

    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it('suppresses completion while composing and resumes after composition', async () => {
    const editor = createEditor()
    const requestCompletion = vi.fn(async () => ' tomorrow')
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 20,
      enabled: () => true,
      requestCompletion,
    })

    controller.compositionStart()
    controller.sync()
    await vi.advanceTimersByTimeAsync(40)
    expect(requestCompletion).not.toHaveBeenCalled()

    controller.compositionEnd()
    await vi.advanceTimersByTimeAsync(20)
    expect(requestCompletion).toHaveBeenCalledOnce()
    controller.destroy()
  })

  it('accepts with Tab and dismisses with Escape', async () => {
    const editor = createEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion: async () => null,
    })
    controller.sync()
    await settleLocal()
    const tab = new KeyboardEvent('keydown', { cancelable: true, key: 'Tab' })

    expect(controller.keyDown(tab)).toBe(true)
    expect(tab.defaultPrevented).toBe(true)
    expect(editor.api.string([])).toBe('I plan to write notes')
    expect(controller.getSnapshot()).toBeNull()

    controller.sync()
    await settleLocal()
    const escape = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' })
    expect(controller.keyDown(escape)).toBe(true)
    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it('navigates visible candidates with the IDE arrow-key convention', async () => {
    const editor = createEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [
        { source: 'document', text: ' write notes' },
        { source: 'document', text: ' review tasks' },
      ],
      requestCompletion: async () => null,
    })
    controller.sync()
    await settleLocal()

    const down = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowDown' })
    expect(controller.keyDown(down)).toBe(true)
    expect(down.defaultPrevented).toBe(true)
    expect(controller.getSnapshot()?.index).toBe(1)

    const up = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowUp' })
    expect(controller.keyDown(up)).toBe(true)
    expect(up.defaultPrevented).toBe(true)
    expect(controller.getSnapshot()?.index).toBe(0)
    controller.destroy()
  })

  it('keeps the selected local candidate when an AI option arrives', async () => {
    const editor = createEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 20,
      enabled: () => true,
      getDocumentCompletions: () => [
        { source: 'document', text: ' write notes' },
        { source: 'document', text: ' review tasks' },
      ],
      requestCompletion: async () => ({ source: 'ai', text: ' plan tomorrow' }),
    })
    controller.sync()
    await settleLocal()
    controller.keyDown(new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowDown' }))

    await vi.advanceTimersByTimeAsync(20)

    expect(controller.getSnapshot()).toMatchObject({
      index: 1,
      candidates: [
        { source: 'document', text: ' write notes' },
        { source: 'document', text: ' review tasks' },
        { source: 'ai', text: ' plan tomorrow' },
      ],
    })
    controller.destroy()
  })

  it('exposes a collapsed Slate decoration for ghost text rendering', async () => {
    const editor = createEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion: async () => null,
    })
    controller.sync()
    await settleLocal()

    const decorations = controller.decorate([editor.children[0]!.children[0]!, [0, 0]])
    expect(decorations).toEqual([
      expect.objectContaining({
        anchor: { path: [0, 0], offset: 9 },
        focus: { path: [0, 0], offset: 9 },
        plateInlineCompletionAccept: expect.any(Function),
        plateInlineCompletionCandidates: [{ source: 'document', text: ' write notes' }],
        plateInlineCompletionIndex: 0,
        plateInlineCompletion: ' write notes',
        plateInlineCompletionSource: 'document',
      }),
    ])
    expect(decorations[0]?.plateInlineCompletionAccept(0)).toBe(true)
    expect(editor.api.string([])).toBe('I plan to write notes')
    controller.destroy()
  })

  it('can reactivate after an effect cleanup replay', async () => {
    const editor = createEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion: async () => null,
    })

    controller.destroy()
    controller.activate()
    controller.sync()
    await settleLocal()

    expect(controller.getSnapshot()?.candidates[0]?.text).toBe(' write notes')
    controller.destroy()
  })
})
