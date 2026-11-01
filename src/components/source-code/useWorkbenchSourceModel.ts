import { useEffect } from 'react'
import { LRUCache } from 'lru-cache'
import type { editor as MonacoEditor } from 'monaco-editor'

const references = new WeakMap<MonacoEditor.ITextModel, number>()
const viewStates = new LRUCache<string, MonacoEditor.ICodeEditorViewState>({ max: 64 })

// Multiple panes share one text model and undo history; each editor owns its view.
export const retainSourceModel = (model: MonacoEditor.ITextModel) => {
  references.set(model, (references.get(model) ?? 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    references.set(model, Math.max(0, (references.get(model) ?? 1) - 1))
    // A dock move may detach and attach the same editor in one React commit.
    queueMicrotask(() => {
      if (!references.get(model) && !model.isDisposed()) model.dispose()
    })
  }
}

export const useWorkbenchSourceModel = (
  editor: MonacoEditor.IStandaloneCodeEditor | null,
  paneId?: string,
) => {
  useEffect(() => {
    if (!editor || !paneId) return
    let model = editor.getModel()
    let release = model ? retainSourceModel(model) : undefined
    const key = () => JSON.stringify([paneId, model?.uri.toString()])
    const saveView = () => {
      const state = editor.saveViewState()
      if (state && model) viewStates.set(key(), state)
    }
    const restoreView = () => {
      const saved = viewStates.get(key())
      if (saved) editor.restoreViewState(saved)
    }
    restoreView()
    const beforeChange = editor.onWillChangeModel(saveView)
    const afterChange = editor.onDidChangeModel(() => {
      release?.()
      model = editor.getModel()
      release = model ? retainSourceModel(model) : undefined
      restoreView()
    })
    return () => {
      saveView()
      beforeChange.dispose()
      afterChange.dispose()
      release?.()
    }
  }, [editor, paneId])
}
