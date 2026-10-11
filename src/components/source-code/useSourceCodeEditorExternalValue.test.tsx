import { renderHook } from '@testing-library/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'
import { useSourceCodeEditorExternalValue } from '@/components/source-code/useSourceCodeEditorExternalValue'

const createEditor = (currentValue: string) => {
  const range = { endColumn: 4, endLineNumber: 1, startColumn: 1, startLineNumber: 1 }
  const editor = {
    executeEdits: vi.fn(),
    getModel: vi.fn(() => ({ getFullModelRange: () => range, getValue: () => currentValue })),
    pushUndoStop: vi.fn(),
  } as unknown as MonacoEditor.IStandaloneCodeEditor
  return { editor, range }
}

describe('useSourceCodeEditorExternalValue', () => {
  it('updates a persistent Monaco model when the controlled document changes', () => {
    const { editor, range } = createEditor('before')

    renderHook(() =>
      useSourceCodeEditorExternalValue({ editorRef: { current: editor }, value: 'after' }),
    )

    expect(editor.executeEdits).toHaveBeenCalledExactlyOnceWith('marklab.external-value-sync', [
      { forceMoveMarkers: true, range, text: 'after' },
    ])
    expect(editor.pushUndoStop).toHaveBeenCalledOnce()
  })

  it('does not touch a model that already matches the controlled value', () => {
    const { editor } = createEditor('current')

    renderHook(() =>
      useSourceCodeEditorExternalValue({ editorRef: { current: editor }, value: 'current' }),
    )

    expect(editor.executeEdits).not.toHaveBeenCalled()
    expect(editor.pushUndoStop).not.toHaveBeenCalled()
  })

  it('uses the latest controlled value when Monaco mounts after a rerender', () => {
    const { editor, range } = createEditor('before')
    const editorRef = { current: null as MonacoEditor.IStandaloneCodeEditor | null }
    const hook = renderHook(({ value }) => useSourceCodeEditorExternalValue({ editorRef, value }), {
      initialProps: { value: 'stale' },
    })
    hook.rerender({ value: 'latest' })

    hook.result.current(editor)

    expect(editor.executeEdits).toHaveBeenCalledExactlyOnceWith('marklab.external-value-sync', [
      { forceMoveMarkers: true, range, text: 'latest' },
    ])
  })
})
