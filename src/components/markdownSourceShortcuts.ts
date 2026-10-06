import { detectPlatform, matchesKeyboardEvent, parseHotkey } from '@tanstack/react-hotkeys'
import type { editor as MonacoEditor, IDisposable } from 'monaco-editor'

import {
  applyMarkdownSourceFormat,
  markdownSourceFormatActions,
  type MarkdownSourceFormatAction,
} from '@/components/markdownSourceFormatting'
import {
  defaultShortcutBindings,
  resolveShortcutBindings,
  type ShortcutBindings,
  type ShortcutPlatform,
} from '@/logic/shortcuts'
import { isImeKeyboardEvent } from '@/logic/ime'

type MarkdownSourceShortcutOptions = {
  editor: MonacoEditor.IStandaloneCodeEditor
  overrides?: ShortcutBindings
  platform?: ShortcutPlatform
}

export const sourceEditorActionId = (action: MarkdownSourceFormatAction) => `marklab.${action}`

export const resolveMarkdownSourceShortcutBindings = (
  overrides: ShortcutBindings = {},
  platform: ShortcutPlatform = detectPlatform(),
) => {
  const resolved = resolveShortcutBindings(overrides)
  const isOverridden = (action: MarkdownSourceFormatAction) =>
    Object.prototype.hasOwnProperty.call(overrides, action)
  const actions = [
    ...markdownSourceFormatActions.filter(isOverridden),
    ...markdownSourceFormatActions.filter((action) => !isOverridden(action)),
  ]

  return {
    platform,
    bindings: actions.flatMap((action) =>
      resolved[action].map((hotkey) => ({ action, hotkey: parseHotkey(hotkey, platform) })),
    ),
    suppressedDefaults: markdownSourceFormatActions
      .filter(isOverridden)
      .flatMap((action) =>
        defaultShortcutBindings[action].map((hotkey) => parseHotkey(hotkey, platform)),
      ),
  }
}

export const registerMarkdownSourceShortcuts = ({
  editor,
  overrides = {},
  platform = detectPlatform(),
}: MarkdownSourceShortcutOptions): IDisposable => {
  const resolved = resolveMarkdownSourceShortcutBindings(overrides, platform)
  const actions = markdownSourceFormatActions.map((action) =>
    editor.addAction({
      id: sourceEditorActionId(action),
      label: action,
      run: () => {
        runMarkdownSourceFormat(editor, action)
      },
    }),
  )
  const keydown = editor.onKeyDown((event) => {
    const keyboardEvent = event.browserEvent
    if (keyboardEvent.defaultPrevented || isImeKeyboardEvent(keyboardEvent)) return

    const match = resolved.bindings.find(({ hotkey }) =>
      matchesKeyboardEvent(keyboardEvent, hotkey, resolved.platform),
    )
    const suppressDefault = resolved.suppressedDefaults.some((hotkey) =>
      matchesKeyboardEvent(keyboardEvent, hotkey, resolved.platform),
    )
    if (!match && !suppressDefault) return

    keyboardEvent.preventDefault()
    keyboardEvent.stopPropagation()
    if (match) editor.trigger('keyboard', sourceEditorActionId(match.action), null)
  })

  return {
    dispose: () => {
      keydown.dispose()
      actions.forEach((action) => action.dispose())
    },
  }
}

const runMarkdownSourceFormat = (
  editor: MonacoEditor.IStandaloneCodeEditor,
  action: MarkdownSourceFormatAction,
): boolean => {
  const model = editor.getModel()
  const selection = editor.getSelection()
  if (!model || !selection) return false

  const before = model.getValue()
  const result = applyMarkdownSourceFormat({
    action,
    selectionEnd: model.getOffsetAt(selection.getEndPosition()),
    selectionStart: model.getOffsetAt(selection.getStartPosition()),
    text: before,
  })
  if (result.text === before) return false

  const edit = minimalEdit(before, result.text)
  const editStart = model.getPositionAt(edit.start)
  const editEnd = model.getPositionAt(edit.end)
  const scrollPosition = {
    scrollLeft: editor.getScrollLeft(),
    scrollTop: editor.getScrollTop(),
  }
  editor.pushUndoStop()
  editor.executeEdits('marklab.markdown-source-format', [
    {
      forceMoveMarkers: true,
      range: {
        endColumn: editEnd.column,
        endLineNumber: editEnd.lineNumber,
        startColumn: editStart.column,
        startLineNumber: editStart.lineNumber,
      },
      text: edit.text,
    },
  ])
  editor.pushUndoStop()
  const selectionStart = model.getPositionAt(result.selectionStart)
  const selectionEnd = model.getPositionAt(result.selectionEnd)
  editor.setSelection({
    endColumn: selectionEnd.column,
    endLineNumber: selectionEnd.lineNumber,
    startColumn: selectionStart.column,
    startLineNumber: selectionStart.lineNumber,
  })
  editor.setScrollPosition(scrollPosition)
  editor.focus()
  return true
}

export const minimalEdit = (before: string, after: string) => {
  let start = 0
  const maxPrefix = Math.min(before.length, after.length)
  while (start < maxPrefix && before.charCodeAt(start) === after.charCodeAt(start)) start += 1

  let beforeEnd = before.length
  let afterEnd = after.length
  while (
    beforeEnd > start &&
    afterEnd > start &&
    before.charCodeAt(beforeEnd - 1) === after.charCodeAt(afterEnd - 1)
  ) {
    beforeEnd -= 1
    afterEnd -= 1
  }
  return { end: beforeEnd, start, text: after.slice(start, afterEnd) }
}
