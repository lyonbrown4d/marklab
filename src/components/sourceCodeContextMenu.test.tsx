import { createRef } from 'react'
import { renderHook } from '@testing-library/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'
import { useSourceCodeContextMenu } from '@/components/sourceCodeContextMenu'

const createEditor = (selectionEmpty = false) => {
  const editor = {
    focus: vi.fn(),
    getModel: () => ({ canRedo: () => false, canUndo: () => true }),
    getSelection: () => ({ isEmpty: () => selectionEmpty }),
    trigger: vi.fn(),
  } as unknown as MonacoEditor.IStandaloneCodeEditor
  return editor
}

describe('useSourceCodeContextMenu', () => {
  it('reports live Monaco capabilities and routes formatting through registered actions', () => {
    const editor = createEditor()
    const editorRef = createRef<MonacoEditor.IStandaloneCodeEditor | null>()
    editorRef.current = editor
    const { result } = renderHook(() => useSourceCodeContextMenu(editorRef))

    expect(result.current.getCapabilities()).toMatchObject({
      copy: true,
      copyAsMarkdown: true,
      cut: true,
      pasteAsPlainText: true,
      redo: false,
      undo: true,
    })
    result.current.onAction('bold')

    expect(editor.focus).toHaveBeenCalledTimes(1)
    expect(editor.trigger).toHaveBeenCalledWith(
      'marklab.editorContextMenu',
      'marklab.editor.bold',
      null,
    )

    result.current.onAction('copyAsMarkdown')
    result.current.onAction('pasteAsPlainText')
    expect(editor.trigger).toHaveBeenCalledWith(
      'marklab.editorContextMenu',
      'editor.action.clipboardCopyAction',
      null,
    )
    expect(editor.trigger).toHaveBeenCalledWith(
      'marklab.editorContextMenu',
      'editor.action.clipboardPasteAction',
      null,
    )
  })

  it('disables editor actions before Monaco mounts', () => {
    const editorRef = createRef<MonacoEditor.IStandaloneCodeEditor | null>()
    const { result } = renderHook(() => useSourceCodeContextMenu(editorRef))

    expect(result.current.getCapabilities()).toMatchObject({
      bold: false,
      copy: false,
      copyAsMarkdown: false,
      link: false,
      paste: false,
      pasteAsPlainText: false,
      undo: false,
    })
    expect(() => result.current.onAction('bold')).not.toThrow()
  })
})
