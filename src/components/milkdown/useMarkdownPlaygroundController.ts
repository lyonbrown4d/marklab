import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Crepe } from '@milkdown/crepe'
import { editorViewOptionsCtx, serializerCtx } from '@milkdown/kit/core'
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
import { typewriterScroll } from '@/components/milkdown/typewriterScrollPlugin'
import {
  readPlaygroundMarkdown,
  relocateFixedDropIndicatorToViewportRoot,
  replaceMarkdownLikePlayground,
} from '@/components/milkdown/markdownPlaygroundActions'
import type {
  MarkdownEditorStatus,
  MarkdownPlaygroundControllerOptions,
  ThrottledMarkdownUpdate,
} from '@/components/milkdown/markdownEditorTypes'
import { waitForMarkdownEditorMount } from '@/components/markdownEditorPerformance'
import { useMilkdownEditorContextMenu } from '@/components/milkdown/useMilkdownEditorContextMenu'
import { useMarkdownPlaygroundSync } from '@/components/milkdown/useMarkdownPlaygroundSync'
import { createMarkdownUpdateThrottle } from '@/components/milkdown/markdownUpdateThrottle'
import * as snapshotBridge from '@/components/milkdown/markdownSnapshotBridge'
import { useMarkdownEditorAccess } from '@/components/milkdown/useMarkdownEditorAccess'
export const useMarkdownPlaygroundController = ({
  activePath,
  darkMode,
  onChange,
  onCalendarFileCreate,
  placeholder,
  slashLabels,
  shortcutOverrides,
  readOnly = false,
  value,
}: MarkdownPlaygroundControllerOptions) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement | null>(null)
  const crepeRef = useRef<Crepe | null>(null)
  const pendingDestroyRef = useRef<Promise<unknown>>(Promise.resolve())
  const editorGenerationRef = useRef(0)
  const latestValueRef = useRef(value)
  const latestValuePathRef = useRef(activePath)
  const onChangeRef = useRef(onChange)
  const throttledMarkdownUpdateRef = useRef<ThrottledMarkdownUpdate | null>(null)
  const markdownSnapshotSchedulerRef = useRef<snapshotBridge.MarkdownSnapshotScheduler | null>(null)
  const onCalendarFileCreateRef = useRef(onCalendarFileCreate)
  const activePathRef = useRef(activePath)
  const activePathListenersRef = useRef(new Set<() => void>())
  const applyingExternalValueRef = useRef(false)
  const [status, setStatus] = useState<MarkdownEditorStatus>({ phase: 'loading' })
  const [codeBlockTheme] = useState(createMarkdownCodeBlockTheme)
  const urlDialog = useSlashUrlDialog(activePath)
  const { open: openUrlDialog, invalidate: invalidateUrlDialog } = urlDialog
  const contextMenu = useMilkdownEditorContextMenu({
    crepeRef,
    onLinkInsert: openUrlDialog,
    readOnly,
  })
  const editorAccess = useMarkdownEditorAccess({ crepeRef, latestValueRef })
  const shortcutPlugin = useMarkdownPlaygroundShortcuts({
    crepeRef,
    enabled: status.phase === 'ready' && !urlDialog.request && !readOnly,
    overrides: shortcutOverrides,
    onUrlInsert: openUrlDialog,
  })

  useLayoutEffect(() => {
    codeBlockTheme.setDarkMode(darkMode)
    if (rootRef.current) refreshMermaidPreviews(rootRef.current)
  }, [codeBlockTheme, darkMode])

  useMarkdownPlaygroundSync({
    activePath,
    activePathListenersRef,
    activePathRef,
    applyingExternalValueRef,
    crepeRef,
    latestValuePathRef,
    latestValueRef,
    markdownSnapshotSchedulerRef,
    onCalendarFileCreate,
    onCalendarFileCreateRef,
    onChange,
    onChangeRef,
    throttledMarkdownUpdateRef,
    value,
  })

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
    const updateMarkdown = createMarkdownUpdateThrottle({
      activePathRef,
      latestValuePathRef,
      latestValueRef,
      onChangeRef,
    })
    throttledMarkdownUpdateRef.current = updateMarkdown
    let markdownSnapshotScheduler: snapshotBridge.MarkdownSnapshotScheduler | null = null

    setStatus({ phase: 'loading' })

    crepe = new Crepe({
      root,
      defaultValue: latestValueRef.current,
      features: readOnly
        ? {
            [Crepe.Feature.BlockEdit]: false,
            [Crepe.Feature.Cursor]: false,
            [Crepe.Feature.Toolbar]: false,
          }
        : undefined,
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
    const pendingCrepe = crepe

    crepe.editor
      .config((ctx) => {
        ctx.update(editorViewOptionsCtx, (options) => ({ ...options, editable: () => !readOnly }))
        markdownSnapshotScheduler = snapshotBridge.createMarkdownSnapshotBridge(
          (document) =>
            pendingCrepe.editor.action((actionCtx) => actionCtx.get(serializerCtx)(document)),
          {
            activePathRef,
            onChangeRef,
            updateMarkdown,
          },
        )
        markdownSnapshotSchedulerRef.current = markdownSnapshotScheduler
      })
      .use(
        snapshotBridge.createMarkdownSnapshotPlugin(
          () =>
            !readOnly &&
            !destroyed &&
            acceptingMarkdownUpdates &&
            !applyingExternalValueRef.current,
          () => markdownSnapshotScheduler,
        ),
      )

    createMarkdownSafePlugins({
      getDocumentPath,
      subscribeDocumentPath,
    }).forEach((plugin) => {
      crepe?.editor.use(plugin)
    })

    crepe.editor.use(animatedCursor).use(typewriterScroll).use(shortcutPlugin)

    void pendingDestroyRef.current
      .then(() => waitForMarkdownEditorMount(latestValueRef.current.length))
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
      snapshotBridge.disposeMarkdownSnapshotBridge(
        markdownSnapshotScheduler,
        markdownSnapshotSchedulerRef,
        updateMarkdown,
        throttledMarkdownUpdateRef,
      )
      acceptingMarkdownUpdates = false
      if (editorGenerationRef.current === creationGeneration) {
        editorGenerationRef.current += 1
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
    readOnly,
    slashLabels,
    shortcutPlugin,
    subscribeDocumentPath,
  ])

  return {
    contextMenu,
    ...editorAccess,
    rootRef,
    scrollAreaRef,
    status,
    urlDialog,
  }
}
