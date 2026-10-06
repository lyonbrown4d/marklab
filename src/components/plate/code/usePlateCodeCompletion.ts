import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { Path } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import type { CompletionItem } from 'vscode-languageserver-types'
import { embeddedLanguageClient } from '@/components/editor/language/embeddedLanguageClient'
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
  const [items, setItems] = useState<CompletionItem[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const generatedId = useId()
  const menuId = `marklab-code-completion-${generatedId}`
  const controllerRef = useRef<CompletionController | null>(null)
  const composingRef = useRef(false)
  const completionTimerRef = useRef<number | null>(null)
  const pathKey = path.join('.')
  const blockPath = useMemo(
    () => (pathKey ? pathKey.split('.').map((part) => Number(part)) : []),
    [pathKey],
  )
  const normalizedLanguage = SUPPORTED_LANGUAGES.get(language.trim().toLowerCase()) ?? null

  useEffect(() => {
    if (!normalizedLanguage) return
    const controller = createPlateCodeCompletionController({
      client: embeddedLanguageClient,
      uri: `marklab-embedded://plate/code-${++documentSequence}.${normalizedLanguage}`,
      languageId: normalizedLanguage,
      text: readPlateCodeSource(editor, blockPath) ?? '',
      onCompletions: (nextItems) => {
        setItems(nextItems.slice(0, 8))
        setActiveIndex(0)
      },
      onError: console.error,
    })
    controllerRef.current = controller
    return () => {
      controllerRef.current = null
      void controller.close().catch(console.error)
    }
  }, [blockPath, editor, normalizedLanguage])

  useEffect(() => {
    controllerRef.current?.updateText(source)
  }, [source])

  useEffect(
    () => () => {
      if (completionTimerRef.current != null) window.clearTimeout(completionTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    const root = editor.api.toDOMNode(editor)
    if (!root) return
    const ownsActiveMenu = () => root.getAttribute('aria-controls') === menuId
    if (items.length > 0) {
      root.setAttribute('aria-activedescendant', `${menuId}-option-${activeIndex}`)
      root.setAttribute('aria-autocomplete', 'list')
      root.setAttribute('aria-controls', menuId)
      root.setAttribute('aria-expanded', 'true')
    } else if (ownsActiveMenu()) {
      root.removeAttribute('aria-activedescendant')
      root.removeAttribute('aria-autocomplete')
      root.removeAttribute('aria-controls')
      root.setAttribute('aria-expanded', 'false')
    }
    return () => {
      if (!ownsActiveMenu()) return
      root.removeAttribute('aria-activedescendant')
      root.removeAttribute('aria-autocomplete')
      root.removeAttribute('aria-controls')
      root.setAttribute('aria-expanded', 'false')
    }
  }, [activeIndex, editor, items.length, menuId])

  const requestCompletion = useCallback(() => {
    const position = editor.selection
      ? pointToEmbeddedPosition(blockPath, editor.selection.focus)
      : null
    if (position) void controllerRef.current?.complete(position)
  }, [blockPath, editor])

  const requestCompletionAfterInput = useCallback(() => {
    if (composingRef.current) return
    if (completionTimerRef.current != null) window.clearTimeout(completionTimerRef.current)
    completionTimerRef.current = window.setTimeout(requestCompletion, 0)
  }, [requestCompletion])

  const selectItem = useCallback(
    (item: CompletionItem) => {
      controllerRef.current?.cancel()
      setItems([])
      applyPlateCodeCompletion(editor, blockPath, item)
    },
    [blockPath, editor],
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
      if (action === 'cancel') {
        controllerRef.current?.cancel()
        setItems([])
      }
      if (action === 'next') setActiveIndex((index) => (index + 1) % items.length)
      if (action === 'previous')
        setActiveIndex((index) => (index - 1 + items.length) % items.length)
      if (action === 'accept' && items[activeIndex]) selectItem(items[activeIndex])
    },
    [activeIndex, items, requestCompletion, selectItem],
  )

  return {
    activeIndex,
    items,
    menuId,
    onActiveIndexChange: setActiveIndex,
    onCompositionEnd: () => {
      composingRef.current = false
      requestCompletionAfterInput()
    },
    onCompositionStart: () => {
      composingRef.current = true
      controllerRef.current?.cancel()
    },
    onInput: requestCompletionAfterInput,
    onKeyDown,
    onPointerUp: requestCompletionAfterInput,
    onSelect: selectItem,
  }
}
