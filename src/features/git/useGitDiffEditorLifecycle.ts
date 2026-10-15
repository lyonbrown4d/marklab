import { useCallback, useId, useLayoutEffect, useRef } from 'react'
import type { editor } from 'monaco-editor'

// The React wrapper disposes models before its widget. Detach first so Monaco's
// asynchronous diff computation cannot observe a disposed, still-attached model.
export const useGitDiffEditorLifecycle = (active = true) => {
  const instanceId = useId()
  const current = useRef<{
    widget: editor.IStandaloneDiffEditor
    models: editor.IDiffEditorModel | null
  } | null>(null)
  const onMount = useCallback((widget: editor.IStandaloneDiffEditor) => {
    current.current = { widget, models: widget.getModel() }
  }, [])
  useLayoutEffect(
    () => () => {
      const owned = current.current
      current.current = null
      if (!owned?.models) return
      if (owned.widget.getModel()) owned.widget.setModel(null)
      if (!owned.models.original.isDisposed()) owned.models.original.dispose()
      if (!owned.models.modified.isDisposed()) owned.models.modified.dispose()
    },
    [active],
  )
  return { instanceId, onMount }
}
