import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type HTMLAttributes,
  type MutableRefObject,
  type ClipboardEvent,
  type DragEvent,
  type Ref,
  type RefObject,
} from 'react'
import { useDropzone } from 'react-dropzone'
import { useHotkeys, type RegisterableHotkey } from '@tanstack/react-hotkeys'
import { ProsemirrorAdapterProvider, useNodeViewFactory } from '@prosemirror-adapter/react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useDarkMode } from '@/hooks/useDarkMode'
import type {
  MarkdownEditorHandle,
  MarkdownEditorProps,
} from '@/components/milkdown/markdownEditorTypes'
import { useMarkdownCrepeController } from '@/components/milkdown/useMarkdownCrepeController'
import { editorShortcutActionIds } from '@/components/milkdown/editorShortcuts'
import {
  hasImageDataTransfer,
  imageSourcesFromPasteEvent,
  imagePathSourcesFromDropEvent,
  imageSourcesFromFiles,
  imageSourcesFromRuntimeDropPaths,
  readNativeClipboardImageSource,
  type MarkdownImageImportSource,
} from '@/components/milkdown/assetEvents'
import { resolveShortcutBindings } from '@/logic/shortcuts'
import { onRuntimeWebviewFileDrop } from '@/runtime/webview'
import { useAppStore } from '@/store/useAppStore'

const MarkdownEditorInner = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  const darkMode = useDarkMode()
  const shellRef = useRef<HTMLDivElement | null>(null)
  const nodeViewFactory = useNodeViewFactory()
  const shortcutOverrides = useAppStore((state) => state.shortcutOverrides)
  const markdownAssetImportStrategy = useAppStore((state) => state.markdownAssetImportStrategy)
  const {
    focusEditor,
    getMarkdown,
    handlers,
    importImageSources,
    placeSelectionAtClientPoint,
    rootRef,
    runShortcutAction,
    scrollAreaRef,
  } = useMarkdownCrepeController({
    ...props,
    darkMode,
    markdownAssetImportStrategy,
    nodeViewFactory,
  })
  const shortcutDefinitions = useMemo(() => {
    const bindings = resolveShortcutBindings(shortcutOverrides)
    return editorShortcutActionIds.flatMap((action) =>
      bindings[action].map((hotkey) => ({
        hotkey: hotkey as RegisterableHotkey,
        callback: () => {
          runShortcutAction(action)
        },
        options: {
          meta: { name: action },
        },
      })),
    )
  }, [runShortcutAction, shortcutOverrides])
  const importDroppedImageSources = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      placeSelectionAtClientPoint(event.clientX, event.clientY)
      await importImageSources(imagePathSourcesFromDropEvent(event))
    },
    [importImageSources, placeSelectionAtClientPoint],
  )
  const importDroppedFiles = useCallback(
    async (files: File[], event: unknown) => {
      if (hasDropPoint(event)) {
        placeSelectionAtClientPoint(event.clientX, event.clientY)
      }
      await importImageSources(imageSourcesFromFiles(files))
    },
    [importImageSources, placeSelectionAtClientPoint],
  )
  const { getRootProps, isDragAccept } = useDropzone({
    accept: { 'image/*': [] },
    multiple: true,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: (files, event) => {
      void importDroppedFiles(files, event)
    },
  })
  const importNativeClipboardImage = useCallback(async () => {
    const source = await readNativeClipboardImageSource()
    if (!source) return false
    return importImageSources([source])
  }, [importImageSources])
  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const sources = imageSourcesFromPasteEvent(event)
      if (sources.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        void importImageSources(sources)
        return
      }

      if (event.clipboardData.getData('text/plain').trim()) return
      event.preventDefault()
      event.stopPropagation()
      void importNativeClipboardImage()
    },
    [importImageSources, importNativeClipboardImage],
  )
  const handleDropCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const sources = imagePathSourcesFromDropEvent(event)
      if (sources.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      void importDroppedImageSources(event)
    },
    [importDroppedImageSources],
  )
  const handleDragOverCapture = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!hasImageDataTransfer(event.dataTransfer)) return
    event.preventDefault()
  }, [])

  useHotkeys(shortcutDefinitions, {
    conflictBehavior: 'replace',
    ignoreInputs: false,
    preventDefault: true,
    stopPropagation: true,
    target: shellRef,
  })

  useImperativeHandle(ref, () => ({
    focus: focusEditor,
    getMarkdown,
  }))

  useRuntimeImageDrop({
    shellRef,
    importImageSources,
    placeSelectionAtClientPoint,
  })
  const dropzoneRootProps = getRootProps({
    className: `crepe flex h-full flex-1 flex-col ${isDragAccept ? 'is-image-drop-target' : ''}`,
    onDragOverCapture: handleDragOverCapture,
    onDropCapture: handleDropCapture,
    onPasteCapture: handlePasteCapture,
  }) as HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }
  const setShellElement = useCallback(
    (node: HTMLDivElement | null) => {
      shellRef.current = node
      assignRef(dropzoneRootProps.ref, node)
    },
    [dropzoneRootProps.ref],
  )

  return (
    <div {...dropzoneRootProps} ref={setShellElement} {...handlers}>
      <ScrollArea
        ref={scrollAreaRef}
        className="h-full flex-1"
        viewportClassName="editor-scroll-viewport"
      >
        <div className="milkdown min-h-full" ref={rootRef} />
      </ScrollArea>
    </div>
  )
})

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>((props, ref) => {
  return (
    <ProsemirrorAdapterProvider>
      <MarkdownEditorInner {...props} ref={ref} />
    </ProsemirrorAdapterProvider>
  )
})

export default MarkdownEditor

const useRuntimeImageDrop = ({
  importImageSources,
  placeSelectionAtClientPoint,
  shellRef,
}: {
  importImageSources: (sources: MarkdownImageImportSource[]) => Promise<boolean>
  placeSelectionAtClientPoint: (clientX: number, clientY: number) => boolean
  shellRef: RefObject<HTMLDivElement | null>
}) => {
  useEffect(() => {
    let disposed = false
    let unlisten: (() => void) | undefined

    const setup = async () => {
      const nextUnlisten = await onRuntimeWebviewFileDrop((event) => {
        const rect = shellRef.current?.getBoundingClientRect()
        if (!rect) return

        const clientX = event.position.x / window.devicePixelRatio
        const clientY = event.position.y / window.devicePixelRatio
        const inside =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        if (!inside) return

        const sources = imageSourcesFromRuntimeDropPaths(event.paths)
        if (sources.length === 0) return

        placeSelectionAtClientPoint(clientX, clientY)
        void importImageSources(sources)
      })
      if (disposed) {
        nextUnlisten?.()
        return
      }
      unlisten = nextUnlisten ?? undefined
    }

    void setup()

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [importImageSources, placeSelectionAtClientPoint, shellRef])
}

const hasDropPoint = (event: unknown): event is { clientX: number; clientY: number } => {
  return (
    Boolean(event) &&
    typeof event === 'object' &&
    typeof (event as { clientX?: unknown }).clientX === 'number' &&
    typeof (event as { clientY?: unknown }).clientY === 'number'
  )
}

const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  if (ref) {
    const mutableRef = ref as MutableRefObject<T | null>
    mutableRef.current = value
  }
}
