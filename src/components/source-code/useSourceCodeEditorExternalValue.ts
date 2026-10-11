import { useLatest } from 'ahooks'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useCallback, useLayoutEffect, type RefObject } from 'react'

type SourceCodeEditorExternalValueOptions = {
  editorRef: RefObject<MonacoEditor.IStandaloneCodeEditor | null>
  value: string
}

export const useSourceCodeEditorExternalValue = ({
  editorRef,
  value,
}: SourceCodeEditorExternalValueOptions) => {
  const valueRef = useLatest(value)
  const sync = useCallback(
    (mountedEditor?: MonacoEditor.IStandaloneCodeEditor) => {
      const editor = mountedEditor ?? editorRef.current
      const nextValue = valueRef.current
      const model = editor?.getModel()
      if (!editor || !model || model.getValue() === nextValue) return

      editor.executeEdits('marklab.external-value-sync', [
        {
          forceMoveMarkers: true,
          range: model.getFullModelRange(),
          text: nextValue,
        },
      ])
      editor.pushUndoStop()
    },
    [editorRef, valueRef],
  )

  useLayoutEffect(() => {
    sync()
  }, [sync, value])

  return sync
}
