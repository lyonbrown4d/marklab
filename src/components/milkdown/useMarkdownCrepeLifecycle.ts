import { useEffect, useRef, type RefObject } from 'react'
import type { NodeViewFactory } from '@/components/milkdown/configureMarkdownCrepe'
import type { MarkdownCrepeInstance } from '@/components/milkdown/createMarkdownCrepe'
import {
  normalizeMarkdownLineBreaks,
  readCrepeMarkdown,
  type ReplaceMarkdownOptions,
} from '@/components/milkdown/editorActions'
import { loadMarkdownCrepeRuntime } from '@/components/milkdown/markdownCrepeRuntime'
import { scheduleMarkdownEditorCreate } from '@/components/milkdown/markdownCrepeScheduling'
import type {
  MarkdownEditorProps,
  MarkdownEditorStatus,
} from '@/components/milkdown/markdownEditorTypes'

type LifecycleOptions = {
  rootRef: RefObject<HTMLDivElement | null>
  crepeRef: RefObject<MarkdownCrepeInstance | null>
  latestValue: RefObject<string>
  activePathRef: RefObject<string | null>
  onChangeRef: RefObject<MarkdownEditorProps['onChange']>
  localEchoRef: RefObject<{ path: string | null; value: string } | null>
  applyingExternalValueRef: RefObject<boolean>
  lastSyncedPathRef: RefObject<string | null>
  scheduledExternalApplyRef: RefObject<number>
  setStatus: (status: MarkdownEditorStatus) => void
  darkMode: boolean
  placeholder: string
  slashLabels: MarkdownEditorProps['slashLabels']
  nodeViewFactory: NodeViewFactory
  getImageDocumentPath: () => string | null
  subscribeImageDocumentPath: (listener: () => void) => () => void
  resolveImageSrc: (path: string | null, src: string) => Promise<string>
  pickAndImportImage: () => Promise<boolean>
  createCalendarFileLink: () => Promise<string | null>
  applyExternalValue: (
    crepe: MarkdownCrepeInstance,
    value: string,
    options?: ReplaceMarkdownOptions,
  ) => void
  scrollEditorToTop: () => void
  focusEditor: () => void
}

const LARGE_MARKDOWN_AUTO_FOCUS_LIMIT = 50_000
const readInitialCrepeMarkdown = (crepe: MarkdownCrepeInstance, fallback: string): string => {
  try {
    return crepe.getMarkdown() ?? fallback
  } catch {
    return fallback
  }
}

export const useMarkdownCrepeLifecycle = ({
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
}: LifecycleOptions) => {
  const hasInitializedEditorRef = useRef(false)
  const pendingDestroyRef = useRef<Promise<unknown>>(Promise.resolve())

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const valueAtSchedule = latestValue.current
    let destroyed = false
    let crepe: MarkdownCrepeInstance | null = null
    let initialViewportFrame: number | null = null
    setStatus({ phase: 'loading' })

    const cancelCreate = scheduleMarkdownEditorCreate(valueAtSchedule, () => {
      if (destroyed) return
      void Promise.all([loadMarkdownCrepeRuntime(), pendingDestroyRef.current])
        .then(([{ configureMarkdownCrepe, createMarkdownCrepe }]) => {
          if (destroyed) return null
          const initialValueAtCreate = latestValue.current
          const initialPathAtCreate = activePathRef.current
          crepe = createMarkdownCrepe({
            root,
            initialValue: initialValueAtCreate,
            darkMode,
            onSlashImageImport: pickAndImportImage,
            onSlashCalendarFileCreate: createCalendarFileLink,
            placeholder,
            slashLabels,
          })
          configureMarkdownCrepe(crepe, {
            getImageDocumentPath,
            nodeViewFactory,
            onMarkdownUpdated: (markdown) => {
              if (destroyed || crepeRef.current !== crepe) return
              const nextMarkdown = normalizeMarkdownLineBreaks(markdown)
              if (applyingExternalValueRef.current) {
                latestValue.current = nextMarkdown
                return
              }
              if (nextMarkdown === latestValue.current) return
              latestValue.current = nextMarkdown
              localEchoRef.current = { path: activePathRef.current, value: nextMarkdown }
              onChangeRef.current(nextMarkdown)
            },
            resolveImageSrc,
            subscribeImageDocumentPath,
          })
          return Promise.resolve(crepe.create()).then(() => ({
            initialPathAtCreate,
            initialValueAtCreate,
          }))
        })
        .then((initialState) => {
          if (destroyed || !crepe || !initialState) return
          const { initialPathAtCreate, initialValueAtCreate } = initialState
          crepeRef.current = crepe
          if (
            latestValue.current !== initialValueAtCreate ||
            activePathRef.current !== initialPathAtCreate
          ) {
            applyExternalValue(crepe, latestValue.current, { preserveSelection: false })
          } else {
            latestValue.current = readInitialCrepeMarkdown(crepe, latestValue.current)
          }
          setStatus({ phase: 'ready' })
          lastSyncedPathRef.current = activePathRef.current
          if (!hasInitializedEditorRef.current) {
            hasInitializedEditorRef.current = true
            if (activePathRef.current) {
              initialViewportFrame = window.requestAnimationFrame(() => {
                initialViewportFrame = null
                if (destroyed || crepeRef.current !== crepe) return
                scrollEditorToTop()
                if (initialValueAtCreate.length <= LARGE_MARKDOWN_AUTO_FOCUS_LIMIT) focusEditor()
              })
            }
          }
        })
        .catch((error: unknown) => {
          if (destroyed) return
          const message = error instanceof Error ? error.message : String(error)
          setStatus({ phase: 'error', message })
          console.error('Failed to initialize Milkdown', error)
        })
    })

    return () => {
      destroyed = true
      cancelCreate()
      scheduledExternalApplyRef.current += 1
      if (initialViewportFrame !== null) window.cancelAnimationFrame(initialViewportFrame)
      if (crepe && crepeRef.current === crepe) {
        latestValue.current = readCrepeMarkdown(crepe, latestValue.current)
        crepeRef.current = null
      }
      try {
        if (crepe) {
          pendingDestroyRef.current = Promise.resolve(crepe.destroy()).catch((error: unknown) => {
            console.error('Failed to destroy Milkdown', error)
          })
        }
      } catch (error) {
        console.error('Failed to destroy Milkdown', error)
      }
    }
  }, [
    activePathRef,
    applyExternalValue,
    applyingExternalValueRef,
    createCalendarFileLink,
    crepeRef,
    darkMode,
    focusEditor,
    getImageDocumentPath,
    lastSyncedPathRef,
    latestValue,
    localEchoRef,
    nodeViewFactory,
    onChangeRef,
    pickAndImportImage,
    placeholder,
    resolveImageSrc,
    rootRef,
    scheduledExternalApplyRef,
    scrollEditorToTop,
    setStatus,
    slashLabels,
    subscribeImageDocumentPath,
  ])
}
