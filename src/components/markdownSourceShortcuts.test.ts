import { describe, expect, it, vi } from 'vitest'

import {
  registerMarkdownSourceShortcuts,
  resolveMarkdownSourceShortcutBindings,
  sourceEditorActionId,
} from '@/components/markdownSourceShortcuts'

describe('Markdown source shortcuts', () => {
  it('uses the shared configurable shortcut bindings', () => {
    const resolved = resolveMarkdownSourceShortcutBindings(
      { 'editor.bold': ['Mod+Shift+B'], 'editor.quote': [] },
      'windows',
    )

    expect(resolved.bindings.find((item) => item.action === 'editor.bold')?.hotkey).toMatchObject({
      ctrl: true,
      key: 'B',
      shift: true,
    })
    expect(resolved.bindings.some((item) => item.action === 'editor.quote')).toBe(false)
    expect(resolved.suppressedDefaults.length).toBeGreaterThan(0)
  })

  it('registers Monaco actions and applies a minimal edit while preserving scroll', async () => {
    const harness = createEditorHarness('before alpha after', 7, 12)
    const registration = registerMarkdownSourceShortcuts({
      editor: harness.editor,
      overrides: {},
      platform: 'windows',
    })
    const bold = harness.actions.get(sourceEditorActionId('editor.bold'))

    await bold?.run()

    expect(harness.executeEdits).toHaveBeenCalledWith('marklab.markdown-source-format', [
      expect.objectContaining({ text: '**alpha**' }),
    ])
    expect(harness.setSelection).toHaveBeenCalled()
    expect(harness.setScrollPosition).toHaveBeenCalledWith({ scrollLeft: 12, scrollTop: 34 })

    registration.dispose()
    expect(harness.keydown.dispose).toHaveBeenCalled()
    harness.actionDisposables.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1))
  })

  it('routes a matching keydown through the registered Monaco action', () => {
    const harness = createEditorHarness('alpha', 0, 5)
    registerMarkdownSourceShortcuts({
      editor: harness.editor,
      overrides: { 'editor.bold': ['Control+Shift+B'] },
      platform: 'windows',
    })
    const event = new KeyboardEvent('keydown', { ctrlKey: true, key: 'b', shiftKey: true })
    const preventDefault = vi.spyOn(event, 'preventDefault')
    const stopPropagation = vi.spyOn(event, 'stopPropagation')

    harness.fireKeydown(event)

    expect(harness.trigger).toHaveBeenCalledWith(
      'keyboard',
      sourceEditorActionId('editor.bold'),
      null,
    )
    expect(preventDefault).toHaveBeenCalled()
    expect(stopPropagation).toHaveBeenCalled()
  })
})

const createEditorHarness = (initialValue: string, startOffset: number, endOffset: number) => {
  let value = initialValue
  let keydownListener: ((event: { browserEvent: KeyboardEvent }) => void) | undefined
  const actions = new Map<string, { run: () => unknown }>()
  const actionDisposables = new Set<ReturnType<typeof vi.fn>>()
  const model = {
    getValue: () => value,
    getFullModelRange: () => ({
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: value.length + 1,
    }),
    getOffsetAt: (position: { column: number }) => position.column - 1,
    getPositionAt: (offset: number) => ({ column: offset + 1, lineNumber: 1 }),
  }
  const executeEdits = vi.fn(
    (
      _source: string,
      edits: Array<{ range: { startColumn: number; endColumn: number }; text: string }>,
    ) => {
      const edit = edits[0]
      if (!edit) return
      value =
        value.slice(0, edit.range.startColumn - 1) +
        edit.text +
        value.slice(edit.range.endColumn - 1)
    },
  )
  const setSelection = vi.fn()
  const setScrollPosition = vi.fn()
  const trigger = vi.fn()
  const keydown = { dispose: vi.fn() }
  const editor = {
    addAction: vi.fn((action: { id: string; run: () => unknown }) => {
      actions.set(action.id, action)
      const dispose = vi.fn()
      actionDisposables.add(dispose)
      return { dispose }
    }),
    executeEdits,
    getModel: () => model,
    focus: vi.fn(),
    getScrollLeft: () => 12,
    getScrollTop: () => 34,
    getSelection: () => ({
      getEndPosition: () => ({ column: endOffset + 1, lineNumber: 1 }),
      getStartPosition: () => ({ column: startOffset + 1, lineNumber: 1 }),
    }),
    onKeyDown: (listener: typeof keydownListener) => {
      keydownListener = listener
      return keydown
    },
    pushUndoStop: vi.fn(),
    setScrollPosition,
    setSelection,
    trigger,
  }

  return {
    actionDisposables,
    actions,
    editor: editor as never,
    executeEdits,
    fireKeydown: (event: KeyboardEvent) => keydownListener?.({ browserEvent: event }),
    keydown,
    setScrollPosition,
    setSelection,
    trigger,
  }
}
