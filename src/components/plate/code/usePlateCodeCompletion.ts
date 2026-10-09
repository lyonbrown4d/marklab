import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Path } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type { CompletionItem } from 'vscode-languageserver-types'
import { embeddedLanguageClient } from '@/components/editor/language/embeddedLanguageClient'
import { getEditorSuggestionOptionIdForIndex } from '@/components/menu/EditorSuggestionMenu'
import { useEditorSuggestionAria } from '@/components/menu/useEditorSuggestionAria'
import {
  applyPlateCodeCompletion,
  pointToEmbeddedPosition,
  readPlateCodeSource,
} from '@/components/plate/code/plateCodeCompletionEdits'
import { createPlateCodeCompletionController } from '@/components/plate/code/plateCodeCompletionController'
import { resolvePlateCodeCompletionKey } from '@/components/plate/code/plateCodeCompletionKeys'

const SUPPORTED_LANGUAGES = new Map([
  ['mermaid', 'mermaid'],
  ['mmd', 'mermaid'],
])
const EMPTY_COMPLETION_ITEMS: CompletionItem[] = []
let documentSequence = 0

type CompletionController = ReturnType<typeof createPlateCodeCompletionController>

type UsePlateCodeCompletionOptions = {
  editor: PlateEditor
  language: string
  path: Path
  source: string
}

export const usePlateCodeCompletion = ({
  editor,
  language,
  path,
  source,
}: UsePlateCodeCompletionOptions) => {
  const [completionState, setCompletionState] = useState<{
    contextToken: object
    items: CompletionItem[]
  } | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const generatedId = useId()
  const menuId = `marklab-code-completion-${generatedId}`
  const controllerRef = useRef<CompletionController | null>(null)
  const sessionRevisionRef = useRef(0)
  const acceptCompletionsRef = useRef(true)
  const composingRef = useRef(false)
  const completionTimerRef = useRef<number | null>(null)
  const pathKey = path.join('.')
  const blockPath = useMemo(
    () => (pathKey ? pathKey.split('.').map((part) => Number(part)) : []),
    [pathKey],
  )
  const normalizedLanguage = SUPPORTED_LANGUAGES.get(language.trim().toLowerCase()) ?? null
  const contextToken = useMemo(
    () => ({ blockPath, editor, normalizedLanguage }),
    [blockPath, editor, normalizedLanguage],
  )
  const items =
    completionState?.contextToken === contextToken ? completionState.items : EMPTY_COMPLETION_ITEMS
  const resolvedActiveIndex = items.length > 0 ? Math.min(activeIndex, items.length - 1) : 0
  const activeOptionId = getEditorSuggestionOptionIdForIndex(
    menuId,
    items,
    resolvedActiveIndex,
    (item) => item.label,
  )
  useEditorSuggestionAria({
    activeOptionId,
    editor,
    menuId,
    open: items.length > 0,
  })

  const clearCompletionTimer = useCallback(() => {
    if (completionTimerRef.current == null) return
    window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = null
  }, [])

  const dismissCompletions = useCallback(() => {
    acceptCompletionsRef.current = false
    clearCompletionTimer()
    controllerRef.current?.cancel()
    setCompletionState(null)
    setActiveIndex(0)
  }, [clearCompletionTimer])

  useEffect(() => {
    const sessionRevision = ++sessionRevisionRef.current
    if (!normalizedLanguage) return
    acceptCompletionsRef.current = true
    const controller = createPlateCodeCompletionController({
      client: embeddedLanguageClient,
      uri: `marklab-embedded://plate/code-${++documentSequence}.${normalizedLanguage}`,
      languageId: normalizedLanguage,
      text: readPlateCodeSource(editor, blockPath) ?? '',
      onCompletions: (nextItems) => {
        if (sessionRevisionRef.current !== sessionRevision || !acceptCompletionsRef.current) {
          return
        }
        setCompletionState({ contextToken, items: nextItems.slice(0, 8) })
        setActiveIndex(0)
      },
      onError: console.error,
    })
    controllerRef.current = controller
    return () => {
      acceptCompletionsRef.current = false
      clearCompletionTimer()
      controller.cancel()
      setCompletionState(null)
      setActiveIndex(0)
      if (sessionRevisionRef.current === sessionRevision) sessionRevisionRef.current += 1
      if (controllerRef.current === controller) controllerRef.current = null
      void controller.close().catch(console.error)
    }
  }, [blockPath, clearCompletionTimer, contextToken, editor, normalizedLanguage])

  useEffect(() => {
    controllerRef.current?.updateText(source)
  }, [source])

  useEffect(() => {
    const dismissWhenHidden = () => {
      if (document.visibilityState === 'hidden') dismissCompletions()
    }
    window.addEventListener('blur', dismissCompletions)
    window.addEventListener('pagehide', dismissCompletions)
    document.addEventListener('visibilitychange', dismissWhenHidden)
    return () => {
      window.removeEventListener('blur', dismissCompletions)
      window.removeEventListener('pagehide', dismissCompletions)
      document.removeEventListener('visibilitychange', dismissWhenHidden)
      clearCompletionTimer()
    }
  }, [clearCompletionTimer, dismissCompletions])

  const requestCompletion = useCallback(() => {
    const controller = controllerRef.current
    const sessionRevision = sessionRevisionRef.current
    if (!controller) return
    const position = editor.selection
      ? pointToEmbeddedPosition(blockPath, editor.selection.focus)
      : null
    if (
      position &&
      sessionRevisionRef.current === sessionRevision &&
      controllerRef.current === controller
    ) {
      acceptCompletionsRef.current = true
      void controller.complete(position)
    }
  }, [blockPath, editor])

  const requestCompletionAfterInput = useCallback(() => {
    if (composingRef.current) return
    acceptCompletionsRef.current = false
    clearCompletionTimer()
    setCompletionState(null)
    setActiveIndex(0)
    const controller = controllerRef.current
    const sessionRevision = sessionRevisionRef.current
    if (!controller) return
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null
      if (
        composingRef.current ||
        sessionRevisionRef.current !== sessionRevision ||
        controllerRef.current !== controller
      ) {
        return
      }
      requestCompletion()
    }, 0)
  }, [clearCompletionTimer, requestCompletion])

  const selectItem = useCallback(
    (item: CompletionItem) => {
      acceptCompletionsRef.current = false
      controllerRef.current?.cancel()
      setCompletionState({ contextToken, items: [] })
      applyPlateCodeCompletion(editor, blockPath, item)
    },
    [blockPath, contextToken, editor],
  )

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const action = resolvePlateCodeCompletionKey({
        key: event.key,
        composing: composingRef.current || event.nativeEvent.isComposing,
        menuOpen: items.length > 0,
        ctrl: event.ctrlKey || event.metaKey,
      })
      if (action === 'none') return
      event.preventDefault()
      event.stopPropagation()
      if (action === 'complete') requestCompletion()
      if (action === 'cancel') dismissCompletions()
      if (action === 'next') setActiveIndex((index) => (index + 1) % items.length)
      if (action === 'previous')
        setActiveIndex((index) => (index - 1 + items.length) % items.length)
      if (action === 'accept' && items[resolvedActiveIndex]) {
        selectItem(items[resolvedActiveIndex])
      }
    },
    [dismissCompletions, items, requestCompletion, resolvedActiveIndex, selectItem],
  )

  return {
    activeIndex: resolvedActiveIndex,
    items,
    menuId,
    onActiveIndexChange: setActiveIndex,
    onCompositionEnd: () => {
      composingRef.current = false
      requestCompletionAfterInput()
    },
    onCompositionStart: () => {
      composingRef.current = true
      dismissCompletions()
    },
    onInput: requestCompletionAfterInput,
    onKeyDown,
    onPointerUp: requestCompletionAfterInput,
    onSelect: selectItem,
  }
}
