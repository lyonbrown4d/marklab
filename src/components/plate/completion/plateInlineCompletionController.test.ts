import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlateInlineCompletionController } from '@/components/plate/completion/plateInlineCompletionController'
import {
  createCompletionEditor,
  settleCompletion,
} from '@/components/plate/completion/plateInlineCompletionController.testUtils'

describe('Plate inline document completion', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('shows a document menu without starting an AI request', async () => {
    const editor = createCompletionEditor()
    const requestCompletion = vi.fn(async () => ' tomorrow')
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 40,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion,
    })

    controller.sync()
    await settleCompletion()
    await vi.advanceTimersByTimeAsync(40)

    expect(controller.getSnapshot()).toEqual({
      anchor: { path: [0, 0], offset: 9 },
      candidates: [{ source: 'document', text: ' write notes' }],
      index: 0,
      kind: 'document',
    })
    expect(requestCompletion).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('navigates the document menu and accepts with Enter', async () => {
    const editor = createCompletionEditor()
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
    await settleCompletion()

    const down = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowDown' })
    expect(controller.keyDown(down)).toBe(true)
    expect(down.defaultPrevented).toBe(true)
    expect(controller.getSnapshot()).toMatchObject({ index: 1, kind: 'document' })

    const up = new KeyboardEvent('keydown', { cancelable: true, key: 'ArrowUp' })
    expect(controller.keyDown(up)).toBe(true)
    expect(controller.getSnapshot()).toMatchObject({ index: 0, kind: 'document' })
    expect(controller.keyDown(up)).toBe(true)
    expect(controller.getSnapshot()).toMatchObject({ index: 1, kind: 'document' })

    const enter = new KeyboardEvent('keydown', { cancelable: true, key: 'Enter' })
    expect(controller.keyDown(enter)).toBe(true)
    expect(enter.defaultPrevented).toBe(true)
    expect(editor.api.string([])).toBe('I plan to review tasks')
    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it('accepts a document candidate with Tab and dismisses with Escape', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion: async () => null,
    })
    controller.sync()
    await settleCompletion()

    const tab = new KeyboardEvent('keydown', { cancelable: true, key: 'Tab' })
    expect(controller.keyDown(tab)).toBe(true)
    expect(editor.api.string([])).toBe('I plan to write notes')

    editor.tf.delete({
      at: {
        anchor: { path: [0, 0], offset: 9 },
        focus: { path: [0, 0], offset: 21 },
      },
    })
    controller.sync()
    await settleCompletion()
    const escape = new KeyboardEvent('keydown', { cancelable: true, key: 'Escape' })
    expect(controller.keyDown(escape)).toBe(true)
    expect(controller.getSnapshot()).toBeNull()
    controller.destroy()
  })

  it.each([
    ['Shift+Tab', { key: 'Tab', shiftKey: true }],
    ['Shift+Enter', { key: 'Enter', shiftKey: true }],
    ['Control+Enter', { ctrlKey: true, key: 'Enter' }],
    ['Meta+Enter', { key: 'Enter', metaKey: true }],
    ['a composing Enter', { isComposing: true, key: 'Enter' }],
    ['Process', { key: 'Process' }],
  ] satisfies readonly (readonly [string, KeyboardEventInit])[])(
    'keeps the document candidate visible for %s',
    async (_label, init) => {
      const editor = createCompletionEditor()
      const controller = createPlateInlineCompletionController(editor, {
        canComplete: () => true,
        debounceMs: () => 100,
        enabled: () => true,
        getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
        requestCompletion: async () => null,
      })
      controller.sync()
      await settleCompletion()
      const snapshot = controller.getSnapshot()
      const event = new KeyboardEvent('keydown', { cancelable: true, ...init })

      expect(controller.keyDown(event)).toBe(false)
      expect(event.defaultPrevented).toBe(false)
      expect(editor.api.string([])).toBe('I plan to')
      expect(controller.getSnapshot()).toBe(snapshot)
      controller.destroy()
    },
  )

  it('exposes a menu-only decoration and accepts a mouse-selected option', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion: async () => null,
    })
    controller.sync()
    await settleCompletion()

    const decorations = controller.decorate([editor.children[0]!.children[0]!, [0, 0]])
    expect(decorations).toEqual([
      expect.objectContaining({
        anchor: { path: [0, 0], offset: 9 },
        focus: { path: [0, 0], offset: 9 },
        plateInlineCompletionAccept: expect.any(Function),
        plateInlineCompletionCandidates: [{ source: 'document', text: ' write notes' }],
        plateInlineCompletionIndex: 0,
        plateInlineCompletionKind: 'document',
      }),
    ])
    expect(decorations[0]).not.toHaveProperty('plateInlineCompletion')
    expect(decorations[0]?.plateInlineCompletionAccept(0)).toBe(true)
    expect(editor.api.string([])).toBe('I plan to write notes')
    controller.destroy()
  })

  it('does not accept after the selection becomes stale', async () => {
    const editor = createCompletionEditor()
    const controller = createPlateInlineCompletionController(editor, {
      canComplete: () => true,
      debounceMs: () => 100,
      enabled: () => true,
      getDocumentCompletions: () => [{ source: 'document', text: ' write notes' }],
      requestCompletion: async () => null,
    })
    controller.sync()
    await settleCompletion()
    const accept = controller.decorate([editor.children[0]!.children[0]!, [0, 0]])[0]
      ?.plateInlineCompletionAccept
    editor.tf.select({
      anchor: { path: [0, 0], offset: 2 },
      focus: { path: [0, 0], offset: 2 },
    })

    expect(accept?.(0)).toBe(false)
    expect(editor.api.string([])).toBe('I plan to')
    controller.destroy()
  })
})
