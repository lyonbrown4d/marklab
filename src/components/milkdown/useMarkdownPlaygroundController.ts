import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Crepe } from '@milkdown/crepe'
import throttle from 'lodash-es/throttle'
import { editorViewCtx } from '@milkdown/kit/core'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { getMarkdown } from '@milkdown/kit/utils'
import { createMarkdownCodeBlockTheme } from '@/components/milkdown/markdownCodeBlockTheme'
import { animatedCursor } from '@/components/milkdown/animatedCursorPlugin'
import { createMarkdownSafePlugins } from '@/components/milkdown/markdownSafePlugins'
import {
  mermaidCodeBlockConfig,
  refreshMermaidPreviews,
} from '@/components/milkdown/mermaidPreview'
import { createMarkdownPlaygroundSlashConfig } from '@/components/milkdown/slashMenuConfig'
import { useSlashUrlDialog } from '@/components/milkdown/useSlashUrlDialog'
import { useMarkdownPlaygroundShortcuts } from '@/components/milkdown/useMarkdownPlaygroundShortcuts'
import type { ShortcutBindings } from '@/logic/shortcuts'
import { typewriterScroll } from '@/components/milkdown/typewriterScrollPlugin'
import {
  readPlaygroundMarkdown,
  relocateFixedDropIndicatorToViewportRoot,
  replaceMarkdownLikePlayground,
} from '@/components/milkdown/markdownPlaygroundActions'
import type {
  MarkdownEditorProps,
  MarkdownEditorStatus,
} from '@/components/milkdown/markdownEditorTypes'

type UseMarkdownPlaygroundControllerOptions = MarkdownEditorProps & {
  darkMode: boolean
  shortcutOverrides?: ShortcutBindings
}

type QueuedMarkdownUpdate = {
  documentIdentity: MarkdownEditorProps['activePath']
  markdown: string
  onChange: MarkdownEditorProps['onChange']
}

type ThrottledMarkdownUpdate = ((update: QueuedMarkdownUpdate) => void) & {
  cancel: () => void
  flush: () => void
}

export const useMarkdownPlaygroundController = ({
  activePath,
  darkMode,
  onChange,
  onCalendarFileCreate,
  placeholder,
  slashLabels,
  shortcutOverrides,
  value,
}: UseMarkdownPlaygroundControllerOptions) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const pendingDestroyRef = useRef<Promise<unknown>>(Promise.resolve())
  const editorGenerationRef = useRef(0)
  const latestValueRef = useRef(value)
  const latestValuePathRef = useRef(activePath)
  const onChangeRef = useRef(onChange)
  const throttledMarkdownUpdateRef = useRef<ThrottledMarkdownUpdate | null>(null)
  const onCalendarFileCreateRef = useRef(onCalendarFileCreate)
  const activePathRef = useRef(activePath)
  const activePathListenersRef = useRef(new Set<() => void>())
  const applyingExternalValueRef = useRef(false)
  const [status, setStatus] = useState<MarkdownEditorStatus>({ phase: 'loading' })
  const [codeBlockTheme] = useState(createMarkdownCodeBlockTheme)
  const urlDialog = useSlashUrlDialog(activePath)
  const { open: openUrlDialog, invalidate: invalidateUrlDialog } = urlDialog
  const shortcutPlugin = useMarkdownPlaygroundShortcuts({
    crepeRef,
    enabled: status.phase === 'ready' && !urlDialog.request,
    overrides: shortcutOverrides,
    onUrlInsert: openUrlDialog,
  })

  useLayoutEffect(() => {
    codeBlockTheme.setDarkMode(darkMode)
    if (rootRef.current) refreshMermaidPreviews(rootRef.current)
  }, [codeBlockTheme, darkMode])

  useLayoutEffect(() => {
    if (onChangeRef.current === onChange) return
    throttledMarkdownUpdateRef.current?.flush()
    onChangeRef.current = onChange
  }, [onChange])

  useLayoutEffect(() => {
    onCalendarFileCreateRef.current = onCalendarFileCreate
  }, [onCalendarFileCreate])

  useLayoutEffect(() => {
    throttledMarkdownUpdateRef.current?.flush()
    const documentChanged = activePathRef.current !== activePath
    const valueChanged =
      latestValuePathRef.current !== activePath || latestValueRef.current !== value

    applyingExternalValueRef.current = true
    try {
      activePathRef.current = activePath
      latestValuePathRef.current = activePath
      latestValueRef.current = value
      const crepe = crepeRef.current
      if (crepe && valueChanged) {
        replaceMarkdownLikePlayground(crepe, value)
        // An echoed value can lag behind live edits awaiting their listener callback.
        // Normalize only applied external values, not newer, still-unsaved editor content.
        latestValueRef.current = readPlaygroundMarkdown(crepe, value)
      }
      if (documentChanged) {
        activePathListenersRef.current.forEach((listener) => listener())
      }
    } finally {
      applyingExternalValueRef.current = false
    }
  }, [activePath, value])

  const getDocumentPath = useCallback(() => activePathRef.current, [])

  const subscribeDocumentPath = useCallback((listener: () => void) => {
    activePathListenersRef.current.add(listener)
    return () => {
      activePathListenersRef.current.delete(listener)
    }
  }, [])

  const runSlashImageImport = useCallback(async () => false, [])

  const runSlashCalendarFileCreate = useCallback(async () => {
    const createCalendarFile = onCalendarFileCreateRef.current
    if (!createCalendarFile) return null
    return createCalendarFile()
  }, [])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return undefined

    const creationGeneration = editorGenerationRef.current + 1
    const creationDocumentIdentity = activePathRef.current
    editorGenerationRef.current = creationGeneration
    let acceptingMarkdownUpdates = false
    let creationStarted = false
    let crepeDestroyed = false
    let destroyed = false
    let crepe: Crepe | null = null
    const destroyCrepe = () => {
      if (!crepe || crepeDestroyed || !creationStarted) return
      crepeDestroyed = true
      try {
        pendingDestroyRef.current = Promise.resolve(crepe.destroy()).catch((error: unknown) => {
          console.error('Failed to destroy Milkdown playground editor', error)
        })
      } catch (error) {
        console.error('Failed to destroy Milkdown playground editor', error)
      }
    }
    const updateMarkdown = throttle(
      (update: QueuedMarkdownUpdate) => {
        const { documentIdentity, markdown, onChange: queuedOnChange } = update
        const isCurrentTarget =
          documentIdentity === activePathRef.current && queuedOnChange === onChangeRef.current
        if (
          isCurrentTarget &&
          documentIdentity === latestValuePathRef.current &&
          markdown === latestValueRef.current
        )
          return
        if (isCurrentTarget) {
          latestValuePathRef.current = documentIdentity
          latestValueRef.current = markdown
        }
        queuedOnChange(markdown)
      },
      200,
      { leading: false, trailing: true },
    ) as ThrottledMarkdownUpdate
    throttledMarkdownUpdateRef.current = updateMarkdown

    setStatus({ phase: 'loading' })

    crepe = new Crepe({
      root,
      defaultValue: latestValueRef.current,
      featureConfigs: {
        [Crepe.Feature.BlockEdit]: createMarkdownPlaygroundSlashConfig({
          labels: slashLabels,
          onCalendarFileCreate: runSlashCalendarFileCreate,
          onImageImport: runSlashImageImport,
          onUrlInsert: openUrlDialog,
        }),
        [Crepe.Feature.CodeMirror]: {
          theme: codeBlockTheme.extension,
          ...mermaidCodeBlockConfig,
        },
        [Crepe.Feature.LinkTooltip]: {
          onCopyLink: () => {},
        },
        [Crepe.Feature.Placeholder]: {
          mode: 'block',
          text: placeholder,
        },
      },
    })

    crepe.editor
      .config((ctx) => {
        ctx.get(listenerCtx).markdownUpdated((_, markdown) => {
          if (destroyed || !acceptingMarkdownUpdates || applyingExternalValueRef.current) return
          updateMarkdown({
            documentIdentity: activePathRef.current,
            markdown,
            onChange: onChangeRef.current,
          })
        })
      })
      .use(listener)

    createMarkdownSafePlugins({
      getDocumentPath,
      subscribeDocumentPath,
    }).forEach((plugin) => {
      crepe?.editor.use(plugin)
    })

    crepe.editor.use(animatedCursor).use(typewriterScroll).use(shortcutPlugin)

    const pendingCrepe = crepe
    void pendingDestroyRef.current
      .then(() => {
        if (destroyed) return
        creationStarted = true
        return pendingCrepe.create()
      })
      .then(() => {
        const createdCrepe = crepe
        if (!createdCrepe || destroyed || editorGenerationRef.current !== creationGeneration) {
          destroyCrepe()
          return
        }

        const latestDocumentIdentity = latestValuePathRef.current
        const latestValue = latestValueRef.current
        if (latestDocumentIdentity !== activePathRef.current) {
          destroyCrepe()
          return
        }

        applyingExternalValueRef.current = true
        try {
          if (
            creationDocumentIdentity !== latestDocumentIdentity ||
            readPlaygroundMarkdown(createdCrepe, latestValue) !== latestValue
          ) {
            replaceMarkdownLikePlayground(createdCrepe, latestValue)
          }
        } finally {
          applyingExternalValueRef.current = false
        }

        relocateFixedDropIndicatorToViewportRoot(root)
        latestValueRef.current = readPlaygroundMarkdown(createdCrepe, latestValue)
        crepeRef.current = createdCrepe
        acceptingMarkdownUpdates = true
        setStatus({ phase: 'ready' })
      })
      .catch((error: unknown) => {
        if (destroyed || editorGenerationRef.current !== creationGeneration) {
          destroyCrepe()
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        setStatus({ phase: 'error', message })
        console.error('Failed to initialize Milkdown playground editor', error)
      })

    return () => {
      destroyed = true
      invalidateUrlDialog()
      updateMarkdown.flush()
      updateMarkdown.cancel()
      acceptingMarkdownUpdates = false
      if (editorGenerationRef.current === creationGeneration) {
        editorGenerationRef.current += 1
      }
      if (throttledMarkdownUpdateRef.current === updateMarkdown) {
        throttledMarkdownUpdateRef.current = null
      }
      if (crepeRef.current === crepe) {
        crepeRef.current = null
      }
      destroyCrepe()
    }
  }, [
    codeBlockTheme,
    getDocumentPath,
    invalidateUrlDialog,
    openUrlDialog,
    placeholder,
    runSlashCalendarFileCreate,
    runSlashImageImport,
    slashLabels,
    shortcutPlugin,
    subscribeDocumentPath,
  ])

  const focusEditor = useCallback(() => {
    crepeRef.current?.editor.action((ctx) => {
      ctx.get(editorViewCtx).focus()
    })
  }, [])

  const getCurrentMarkdown = useCallback(() => {
    const crepe = crepeRef.current
    if (!crepe) return latestValueRef.current
    return crepe.editor.action(getMarkdown())
  }, [])

  return {
    focusEditor,
    getMarkdown: getCurrentMarkdown,
    rootRef,
    scrollAreaRef,
    status,
    urlDialog,
  }
}
