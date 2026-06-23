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
  const importingImages = imageImportCount > 0
  const importImageSourcesWithFeedback = useCallback(
    async (sources: MarkdownImageImportSource[]) => {
      if (sources.length === 0) return false
      setImageImportCount((count) => count + 1)

      try {
        return await importImageSources(sources)
      } finally {
        setImageImportCount((count) => Math.max(0, count - 1))
      }
    },
    [importImageSources],
  )
  const importDroppedImageSources = useCallback(
    async (event: DragEvent<HTMLDivElement>) => {
      placeSelectionAtClientPoint(event.clientX, event.clientY)
      await importImageSourcesWithFeedback(imagePathSourcesFromDropEvent(event))
    },
    [importImageSourcesWithFeedback, placeSelectionAtClientPoint],
  )
  const importDroppedFiles = useCallback(
    async (files: File[], event: unknown) => {
      if (hasDropPoint(event)) {
        placeSelectionAtClientPoint(event.clientX, event.clientY)
      }
      await importImageSourcesWithFeedback(imageSourcesFromFiles(files))
    },
    [importImageSourcesWithFeedback, placeSelectionAtClientPoint],
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
    return importImageSourcesWithFeedback([source])
  }, [importImageSourcesWithFeedback])
  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
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
    [importImageSourcesWithFeedback, importNativeClipboardImage],
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

  useRuntimeImageDrop({
    shellRef,
    importImageSources: importImageSourcesWithFeedback,
    placeSelectionAtClientPoint,
  })

  const dropzoneRootProps = getRootProps({
    className: cn(
      'crepe relative flex h-full flex-1 flex-col is-js-drop-indicator',
      isDragAccept && 'is-image-drop-target',
      isEditorEmpty && 'is-empty-editor',
      importingImages && 'is-image-importing',
      statusPhase === 'loading' && 'is-editor-loading',
      statusPhase === 'error' && 'is-editor-error',
      motionSmoothScrolling && 'is-smooth-editor',
      immersiveZenMode && 'is-zen-editor',
      immersiveFocusMode && 'is-focus-editor',
      immersiveTypewriterMode && 'is-typewriter-editor',
    ),
    onDragOverCapture: handleDragOverCapture,
    onDropCapture: handleDropCapture,
    onPasteCapture: handlePasteCapture,
    'data-drop-active': isDragAccept ? 'image' : undefined,
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
