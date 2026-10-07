import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlateInlineCompletionController } from '@/components/plate/completion/plateInlineCompletionController'
import {
  createCompletionEditor,
  settleCompletion,
} from '@/components/plate/completion/plateInlineCompletionController.testUtils'

describe('Plate inline completion lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('drops a queued document candidate after the document changes', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' stale' }],
      requestCompletion: async () => null,
    })
    controller.sync()
    editor.children = [{ type: 'p', children: [{ text: 'Changed!!' }] }]
    await settleCompletion()

    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it('drops a queued document candidate after the selection expands', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' stale' }],
      requestCompletion: async () => null,
    })
    controller.sync()
    editor.tf.select({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 9 },
    })
    await settleCompletion()

    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it('suppresses completion while composing and resumes after composition', async () => {
    const editor = createCompletionEditor()
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

  it('can reactivate after an effect cleanup replay', async () => {
    const editor = createCompletionEditor()
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
    await settleCompletion()

    expect(controller.getSnapshot()).toMatchObject({
      candidates: [{ source: 'document', text: ' write notes' }],
      kind: 'document',
    })
    controller.destroy()
  })

  it('deactivates without discarding subscribers and can resume later', async () => {
    const editor = createCompletionEditor()
    const listener = vi.fn()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion: async () => null,
    })
    controller.subscribe(listener)
    controller.sync()
    await settleCompletion()
    expect(controller.getSnapshot()).not.toBeNull()

    controller.deactivate()
    expect(controller.getSnapshot()).toBeNull()
    const notificationsAfterDeactivate = listener.mock.calls.length

    controller.activate()
    controller.sync()
    await settleCompletion()
    expect(controller.getSnapshot()).not.toBeNull()
    expect(listener.mock.calls.length).toBeGreaterThan(notificationsAfterDeactivate)
    controller.destroy()
  })
})
