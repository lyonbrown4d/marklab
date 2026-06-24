import {
  useCallback,
  useEffect,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type HTMLAttributes,
  type MutableRefObject,
  type Ref,
  type RefObject,
} from 'react'
import { useDropzone } from 'react-dropzone'
import {
  hasImageDataTransfer,
  imagePathSourcesFromDropEvent,
  imageSourcesFromFiles,
  imageSourcesFromPasteEvent,
  imageSourcesFromRuntimeDropPaths,
  readNativeClipboardImageSource,
  type MarkdownImageImportSource,
} from '@/components/milkdown/assetEvents'
import type { MarkdownEditorStatus } from '@/components/milkdown/markdownEditorTypes'
import { cn } from '@/lib/utils'
import { onRuntimeWebviewFileDrop } from '@/runtime/webview'

type UseMarkdownEditorDropOptions = {
  enabled?: boolean
  immersiveFocusMode: boolean
  immersiveTypewriterMode: boolean
  immersiveZenMode: boolean
  importImageSources: (sources: MarkdownImageImportSource[]) => Promise<boolean>
  isEditorEmpty: boolean
  motionSmoothScrolling: boolean
  placeSelectionAtClientPoint: (clientX: number, clientY: number) => boolean
  shellRef: RefObject<HTMLDivElement | null>
  statusPhase: MarkdownEditorStatus['phase']
}

export const useMarkdownEditorDrop = ({
  enabled = true,
  immersiveFocusMode,
  immersiveTypewriterMode,
  immersiveZenMode,
  importImageSources,
  isEditorEmpty,
  motionSmoothScrolling,
  placeSelectionAtClientPoint,
  shellRef,
  statusPhase,
}: UseMarkdownEditorDropOptions) => {
  const [imageImportCount, setImageImportCount] = useState(0)
  const importingImages = enabled && imageImportCount > 0
  const importImageSourcesWithFeedback = useCallback(
    async (sources: MarkdownImageImportSource[]) => {
      if (!enabled || sources.length === 0) return false
      setImageImportCount((count) => count + 1)

      try {
        return await importImageSources(sources)
      } finally {
        setImageImportCount((count) => Math.max(0, count - 1))
      }
    },
    [enabled, importImageSources],
  )
  const importDroppedImageSources = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      if (!enabled) return
      placeSelectionAtClientPoint(event.clientX, event.clientY)
      await importImageSourcesWithFeedback(imagePathSourcesFromDropEvent(event))
    },
    [enabled, importImageSourcesWithFeedback, placeSelectionAtClientPoint],
  )
  const importDroppedFiles = useCallback(
    async (files: File[], event: unknown) => {
      if (!enabled) return
      if (hasDropPoint(event)) {
        placeSelectionAtClientPoint(event.clientX, event.clientY)
      }
      await importImageSourcesWithFeedback(imageSourcesFromFiles(files))
    },
    [enabled, importImageSourcesWithFeedback, placeSelectionAtClientPoint],
  )
  const { getRootProps, isDragAccept } = useDropzone({
    accept: { 'image/*': [] },
    disabled: !enabled,
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
    return importImageSourcesWithFeedback([source])
  }, [importImageSourcesWithFeedback])
  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!enabled) return
      const sources = imageSourcesFromPasteEvent(event)
      if (sources.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        void importImageSourcesWithFeedback(sources)
        return
      }

      if (event.clipboardData.getData('text/plain').trim()) return
      event.preventDefault()
      event.stopPropagation()
      void importNativeClipboardImage()
    },
    [enabled, importImageSourcesWithFeedback, importNativeClipboardImage],
  )
  const handleDropCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!enabled) return
      const sources = imagePathSourcesFromDropEvent(event)
      if (sources.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      void importDroppedImageSources(event)
    },
    [enabled, importDroppedImageSources],
  )
  const handleDragOverCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!enabled || !hasImageDataTransfer(event.dataTransfer)) return
      event.preventDefault()
    },
    [enabled],
  )

  useRuntimeImageDrop({
    enabled,
    shellRef,
    importImageSources: importImageSourcesWithFeedback,
    placeSelectionAtClientPoint,
  })

  const dropzoneRootProps = getRootProps({
    className: cn(
      'crepe relative flex h-full flex-1 flex-col',
      enabled && isDragAccept && 'is-image-drop-target',
      enabled && isEditorEmpty && 'is-empty-editor',
      enabled && importingImages && 'is-image-importing',
      enabled && statusPhase === 'loading' && 'is-editor-loading',
      enabled && statusPhase === 'error' && 'is-editor-error',
      enabled && motionSmoothScrolling && 'is-smooth-editor',
      enabled && immersiveZenMode && 'is-zen-editor',
      enabled && immersiveFocusMode && 'is-focus-editor',
      enabled && immersiveTypewriterMode && 'is-typewriter-editor',
    ),
    onDragOverCapture: enabled ? handleDragOverCapture : undefined,
    onDropCapture: enabled ? handleDropCapture : undefined,
    onPasteCapture: enabled ? handlePasteCapture : undefined,
    'data-drop-active': enabled && isDragAccept ? 'image' : undefined,
    'data-import-active': importingImages ? 'image' : undefined,
  }) as HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }

  const setShellElement = useCallback(
    (node: HTMLDivElement | null) => {
      shellRef.current = node
      assignRef(dropzoneRootProps.ref, node)
    },
    [dropzoneRootProps.ref, shellRef],
  )

  return {
    dropzoneRootProps,
    setShellElement,
  }
}

const useRuntimeImageDrop = ({
  enabled,
  importImageSources,
  placeSelectionAtClientPoint,
  shellRef,
}: {
  enabled: boolean
  importImageSources: (sources: MarkdownImageImportSource[]) => Promise<boolean>
  placeSelectionAtClientPoint: (clientX: number, clientY: number) => boolean
  shellRef: RefObject<HTMLDivElement | null>
}) => {
  useEffect(() => {
    if (!enabled) return undefined

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
  }, [enabled, importImageSources, placeSelectionAtClientPoint, shellRef])
}

const hasDropPoint = (event: unknown): event is { clientX: number; clientY: number } => {
  return (
    Boolean(event) &&
    typeof event === 'object' &&
    typeof (event as { clientX?: unknown }).clientX === 'number' &&
    typeof (event as { clientY?: unknown }).clientY === 'number'
  )
}

const assignRef = <T>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') {
    ref(value)
    return
  }
  if (ref) {
    const mutableRef = ref as MutableRefObject<T | null>
    mutableRef.current = value
  }
}
