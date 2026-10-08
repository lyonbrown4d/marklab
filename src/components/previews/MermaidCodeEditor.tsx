import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  bracketMatching,
  defaultHighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from '@codemirror/language'
import { lintKeymap } from '@codemirror/lint'
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view'
import { eclipse } from '@uiw/codemirror-theme-eclipse'
import { useEffect, useMemo, useRef } from 'react'
import { createMermaidCodeMirrorIntelligence } from '@/components/plate/code/mermaidCodeMirrorLanguage'
import { useDarkMode } from '@/hooks/useDarkMode'
import { useI18n } from '@/i18n/useI18n'

type MermaidCodeEditorProps = {
  onBlur: () => void
  onChange: (value: string) => void
  uri: string
  value: string
}

let mermaidSessionSequence = 0

const nextSessionUri = (uri: string) => {
  mermaidSessionSequence += 1
  return `${uri}#marklab-session-${mermaidSessionSequence}`
}

const stopEditorEvent = (event: { stopPropagation: () => void }) => event.stopPropagation()

const surfaceTheme = (dark: boolean) =>
  EditorView.theme(
    {
      '&': { backgroundColor: 'var(--background)', height: '100%' },
      '&.cm-focused': { outline: 'none' },
      '.cm-content': { caretColor: 'hsl(var(--foreground))', padding: '12px 0' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'hsl(var(--foreground))' },
      '.cm-gutters': {
        backgroundColor: 'var(--muted)',
        borderRight: '1px solid var(--border)',
        color: 'var(--muted-foreground)',
      },
      '.cm-scroller': {
        fontFamily: 'var(--font-mono)',
        lineHeight: '1.55',
        overflow: 'auto',
      },
      '.cm-tooltip': {
        backgroundColor: 'var(--popover)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        boxShadow: 'var(--shadow-md)',
        color: 'var(--popover-foreground)',
        overflow: 'hidden',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'var(--accent)',
        color: 'var(--accent-foreground)',
      },
    },
    { dark },
  )

const editorTheme = (dark: boolean): Extension => [dark ? oneDark : eclipse, surfaceTheme(dark)]

const MermaidCodeEditor = ({ onBlur, onChange, uri, value }: MermaidCodeEditorProps) => {
  const { t } = useI18n()
  const darkMode = useDarkMode()
  const rootRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const blurTimerRef = useRef<number | null>(null)
  const onBlurRef = useRef(onBlur)
  const onChangeRef = useRef(onChange)
  const setupRef = useRef({ darkMode, value })
  const themeCompartment = useMemo(() => new Compartment(), [])

  useEffect(() => {
    onBlurRef.current = onBlur
    onChangeRef.current = onChange
    setupRef.current = { darkMode, value }
  }, [darkMode, onBlur, onChange, value])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const setup = setupRef.current
    const sessionUri = nextSessionUri(uri)
    const intelligence = createMermaidCodeMirrorIntelligence({
      uri: sessionUri,
      value: setup.value,
    })
    const scheduleBlur = (view: EditorView) => {
      if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = window.setTimeout(() => {
        blurTimerRef.current = null
        const active = document.activeElement
        const focusStayedInside = active instanceof Element && root.contains(active)
        if (!view.hasFocus && !focusStayedInside) onBlurRef.current()
      }, 0)
    }
    const state = EditorState.create({
      doc: setup.value,
      selection: EditorSelection.cursor(setup.value.length),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        EditorView.lineWrapping,
        highlightActiveLine(),
        keymap.of([
          ...completionKeymap,
          ...closeBracketsKeymap,
          ...historyKeymap,
          ...defaultKeymap,
          indentWithTab,
          ...lintKeymap,
        ]),
        EditorView.contentAttributes.of({ 'aria-label': t('preview.mermaidEditSource') }),
        EditorView.domEventHandlers({ blur: (_event, view) => scheduleBlur(view) }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
        themeCompartment.of(editorTheme(setup.darkMode)),
        intelligence.extensions,
      ],
    })
    const view = new EditorView({ parent: root, state })
    viewRef.current = view
    view.focus()
    return () => {
      if (blurTimerRef.current !== null) window.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = null
      viewRef.current = null
      view.destroy()
      intelligence.dispose()
    }
  }, [t, themeCompartment, uri])

  useEffect(() => {
    viewRef.current?.dispatch({ effects: themeCompartment.reconfigure(editorTheme(darkMode)) })
  }, [darkMode, themeCompartment])

  useEffect(() => {
    const view = viewRef.current
    if (!view || view.state.doc.toString() === value) return
    view.dispatch({ changes: { from: 0, insert: value, to: view.state.doc.length } })
  }, [value])

  const height = Math.min(420, Math.max(200, value.split('\n').length * 20 + 64))
  return (
    <div
      aria-label={t('preview.mermaidEditSource')}
      className="mt-2 overflow-hidden rounded-lg border border-border bg-background"
      contentEditable={false}
      data-mermaid-code-editor
      onClick={stopEditorEvent}
      onContextMenu={stopEditorEvent}
      onKeyDown={stopEditorEvent}
      onPointerDown={stopEditorEvent}
      ref={rootRef}
      role="region"
      style={{ height }}
    />
  )
}

export default MermaidCodeEditor
