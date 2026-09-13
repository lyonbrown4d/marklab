import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { type NodeViewFactory } from '@/components/milkdown/configureMarkdownCrepe'
import type { MarkdownCrepeInstance } from '@/components/milkdown/createMarkdownCrepe'
import {
  containsActiveElement,
  isEditorChromeTarget,
  scrollEditorViewportToTop,
} from '@/components/milkdown/editorDom'
import {
  focusCrepeEditor,
  focusCrepeEditorAtEnd,
  insertImageIntoCrepe,
  placeCrepeSelectionAtClientPoint,
  readCrepeMarkdown,
  replaceImageSourceInCrepe,
  replaceCrepeMarkdown,
  type PendingExternalValue,
  type ReplaceMarkdownOptions,
} from '@/components/milkdown/editorActions'
import {
  pickMarkdownImageSource,
  type MarkdownImageImportSource,
} from '@/components/milkdown/assetEvents'
import { importMarkdownImageSourcesWithPathNotifications } from '@/components/milkdown/documentPathAssetImport'
import {
  resolveExternalMarkdownSync,
  resolvePendingMarkdownSync,
} from '@/components/milkdown/editorSync'
import { runMarkdownEditorShortcut } from '@/components/milkdown/editorShortcuts'
import { resolveMarkdownImageSource } from '@/components/milkdown/markdownImageSource'
import { useFocusHeadingEvent } from '@/components/milkdown/useFocusHeadingEvent'
import { scheduleMicrotask } from '@/components/milkdown/markdownCrepeScheduling'
import { useMarkdownCrepeLifecycle } from '@/components/milkdown/useMarkdownCrepeLifecycle'
import type {
  MarkdownEditorProps,
  MarkdownEditorStatus,
} from '@/components/milkdown/markdownEditorTypes'
import type { ShortcutActionId } from '@/logic/shortcuts'
import type { MarkdownAssetImportStrategy } from '@/store/appTypes'

type UseMarkdownCrepeControllerOptions = MarkdownEditorProps & {
  darkMode: boolean
  markdownAssetImportStrategy: MarkdownAssetImportStrategy
  nodeViewFactory: NodeViewFactory
}

export const useMarkdownCrepeController = ({
  activePath,
  darkMode,
  markdownAssetImportStrategy,
  nodeViewFactory,
  onChange,
  onCalendarFileCreate,
  placeholder,
  slashLabels,
  value,
}: UseMarkdownCrepeControllerOptions) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<MarkdownCrepeInstance | null>(null)
  const [status, setStatus] = useState<MarkdownEditorStatus>({ phase: 'loading' })
  const latestValue = useRef(value)
  const onChangeRef = useRef(onChange)
  const activePathRef = useRef(activePath)
  const markdownAssetImportStrategyRef = useRef(markdownAssetImportStrategy)
  const activePathListenersRef = useRef(new Set<() => void>())
  const localEchoRef = useRef<{ path: string | null; value: string } | null>(null)
  const applyingExternalValueRef = useRef(false)
  const isComposingRef = useRef(false)
  const lastSyncedPathRef = useRef(activePath)
  const pendingExternalValueRef = useRef<PendingExternalValue | null>(null)
  const scheduledExternalApplyRef = useRef(0)

  const getImageDocumentPath = useCallback(() => activePathRef.current, [])
  const subscribeImageDocumentPath = useCallback((listener: () => void) => {
    activePathListenersRef.current.add(listener)
    return () => {
      activePathListenersRef.current.delete(listener)
    }
  }, [])

  const focusEditor = useCallback(() => {
    focusCrepeEditor(crepeRef.current)
  }, [])

  const getMarkdown = useCallback(() => {
    return readCrepeMarkdown(crepeRef.current, latestValue.current)
  }, [])

  const insertImage = useCallback((src: string, alt?: string) => {
    return insertImageIntoCrepe(crepeRef.current, src, alt)
  }, [])

  const replaceImageSource = useCallback((from: string, to: string) => {
    return replaceImageSourceInCrepe(crepeRef.current, from, to)
  }, [])

  const placeSelectionAtClientPoint = useCallback((clientX: number, clientY: number) => {
    return placeCrepeSelectionAtClientPoint(crepeRef.current, clientX, clientY)
  }, [])

  const importImageSources = useCallback(
    async (sources: MarkdownImageImportSource[]) => {
      return importMarkdownImageSourcesWithPathNotifications(sources, {
        activePath: activePathRef.current,
        getDocumentPath: getImageDocumentPath,
        getEditorIdentity: () => crepeRef.current,
        subscribeDocumentPath: subscribeImageDocumentPath,
        insertImage,
        markdown: readCrepeMarkdown(crepeRef.current, latestValue.current),
        replaceImageSource,
        strategy: markdownAssetImportStrategyRef.current,
      })
    },
    [getImageDocumentPath, insertImage, replaceImageSource, subscribeImageDocumentPath],
  )

  const pickAndImportImage = useCallback(async () => {
    const source = await pickMarkdownImageSource()
    if (!source) return false
    return importImageSources([source])
  }, [importImageSources])

  const createCalendarFileLink = useCallback(async () => {
    if (!onCalendarFileCreate) return null
    return onCalendarFileCreate()
  }, [onCalendarFileCreate])

  const runShortcutAction = useCallback(
    (action: ShortcutActionId) => {
      return runMarkdownEditorShortcut(crepeRef.current, action, {
        onImageImport: pickAndImportImage,
      })
    },
    [pickAndImportImage],
  )

  const resolveImageSrc = useCallback((documentPath: string | null, src: string) => {
    return resolveMarkdownImageSource(documentPath, src)
  }, [])

  const scrollEditorToTop = useCallback(() => {
    scrollEditorViewportToTop(scrollAreaRef.current)
  }, [])

  const applyExternalValue = useCallback(
    (
      crepe: NonNullable<typeof crepeRef.current>,
      nextValue: string,
      options?: ReplaceMarkdownOptions,
    ) => {
      const applyId = scheduledExternalApplyRef.current + 1
      scheduledExternalApplyRef.current = applyId
      scheduleMicrotask(() => {
        if (scheduledExternalApplyRef.current !== applyId) return
        if (crepeRef.current !== crepe) return
        replaceCrepeMarkdown(crepe, nextValue, applyingExternalValueRef, latestValue, options)
      })
    },
    [],
  )

  const hasEditorFocus = useCallback(() => {
    return containsActiveElement(rootRef.current)
  }, [])

  const applyPendingExternalValue = useCallback(() => {
    const crepe = crepeRef.current
    if (!crepe) return

    const decision = resolvePendingMarkdownSync({
      activePath: activePathRef.current,
      currentMarkdown: readCrepeMarkdown(crepe, latestValue.current),
      pending: pendingExternalValueRef.current,
    })

    if (decision.type === 'idle') return

    if (decision.clearPending) {
      pendingExternalValueRef.current = null
    }

    if (decision.type === 'accept') {
      latestValue.current = decision.latestValue
      lastSyncedPathRef.current = decision.lastSyncedPath
      return
    }

    if (decision.type === 'discard') return

    applyExternalValue(crepe, decision.value)
    lastSyncedPathRef.current = decision.lastSyncedPath
  }, [applyExternalValue])

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    markdownAssetImportStrategyRef.current = markdownAssetImportStrategy
  }, [markdownAssetImportStrategy])

  useEffect(() => {
    activePathRef.current = activePath
    activePathListenersRef.current.forEach((listener) => listener())
  }, [activePath])

  useFocusHeadingEvent(activePath, crepeRef)

  useMarkdownCrepeLifecycle({
    rootRef,
    crepeRef,
    latestValue,
    activePathRef,
    onChangeRef,
    localEchoRef,
    applyingExternalValueRef,
    lastSyncedPathRef,
    scheduledExternalApplyRef,
    setStatus,
    darkMode,
    placeholder,
    slashLabels,
    nodeViewFactory,
    getImageDocumentPath,
    subscribeImageDocumentPath,
    resolveImageSrc,
    pickAndImportImage,
    createCalendarFileLink,
    applyExternalValue,
    scrollEditorToTop,
    focusEditor,
  })

  useEffect(() => {
    const crepe = crepeRef.current
    if (!crepe) {
      const decision = resolveExternalMarkdownSync({
        activePath,
        currentMarkdown: latestValue.current,
        editorReady: false,
        hasEditorFocus: false,
        isComposing: isComposingRef.current,
        lastSyncedPath: lastSyncedPathRef.current,
        localEcho: localEchoRef.current,
        value,
      })

      if (decision.type === 'cache-unready') {
        latestValue.current = decision.latestValue
        lastSyncedPathRef.current = decision.lastSyncedPath
      }
      return
    }

    const decision = resolveExternalMarkdownSync({
      activePath,
      currentMarkdown: readCrepeMarkdown(crepe, latestValue.current),
      editorReady: true,
      hasEditorFocus: hasEditorFocus(),
      isComposing: isComposingRef.current,
      lastSyncedPath: lastSyncedPathRef.current,
      localEcho: localEchoRef.current,
      value,
    })

    if (decision.type === 'accept') {
      latestValue.current = decision.latestValue
      if (decision.clearLocalEcho) {
        localEchoRef.current = null
      }
      lastSyncedPathRef.current = decision.lastSyncedPath
      return
    }

    if (decision.type === 'defer') {
      pendingExternalValueRef.current = decision.pending
      return
    }

    if (decision.type === 'replace') {
      if (decision.clearLocalEcho) {
        localEchoRef.current = null
      }
      if (decision.clearPending) {
        pendingExternalValueRef.current = null
      }
      applyExternalValue(crepe, decision.value, decision.replaceOptions)
      lastSyncedPathRef.current = decision.lastSyncedPath
      if (decision.scrollToTop) {
        scrollEditorToTop()
      }
      if (decision.focus) {
        focusEditor()
      }
    }
  }, [activePath, applyExternalValue, focusEditor, hasEditorFocus, scrollEditorToTop, value])

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false
    applyPendingExternalValue()
  }, [applyPendingExternalValue])

  const handleBlur = useCallback(() => {
    applyPendingExternalValue()
  }, [applyPendingExternalValue])

  const handlePointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target) return
    if (isEditorChromeTarget(target)) return
    focusCrepeEditorAtEnd(crepeRef.current)
  }, [])

  return {
    getMarkdown,
    handlers: {
      onBlur: handleBlur,
      onCompositionEnd: handleCompositionEnd,
      onCompositionStart: handleCompositionStart,
      onPointerDown: handlePointerDown,
    },
    focusEditor,
    insertImage,
    importImageSources,
    placeSelectionAtClientPoint,
    rootRef,
    runShortcutAction,
    scrollAreaRef,
    status,
  }
}
