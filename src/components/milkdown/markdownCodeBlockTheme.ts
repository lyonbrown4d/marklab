import { Compartment, type Extension } from '@codemirror/state'
import { ViewPlugin, type EditorView } from '@codemirror/view'
import { oneDark } from '@codemirror/theme-one-dark'
import { eclipse } from '@uiw/codemirror-theme-eclipse'

const darkTheme = oneDark

export const createMarkdownCodeBlockTheme = () => {
  const compartment = new Compartment()
  const views = new Set<EditorView>()
  let currentTheme: Extension = eclipse

  const applyTheme = (view: EditorView) => {
    if (compartment.get(view.state) === currentTheme) return
    view.dispatch({ effects: compartment.reconfigure(currentTheme) })
  }

  const registration = ViewPlugin.define((view) => {
    views.add(view)
    // A newly inserted block must use the current theme, not the initial extension.
    // Dispatch after the view constructor has finished configuring its plugins.
    queueMicrotask(() => {
      if (views.has(view)) applyTheme(view)
    })
    return { destroy: () => views.delete(view) }
  })

  return {
    extension: [compartment.of(currentTheme), registration],
    setDarkMode: (darkMode: boolean) => {
      currentTheme = darkMode ? darkTheme : eclipse
      views.forEach(applyTheme)
    },
  }
}
