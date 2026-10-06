import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type HTMLAttributes,
  type Ref,
  type RefObject,
} from 'react'
import { useDropzone } from 'react-dropzone'
import type { TRange } from 'platejs'
import type { PlateEditor } from 'platejs/react'
import {
  hasImageDataTransfer,
  imageSourcesFromClipboardData,
  imagePathSourcesFromDropEvent,
  imageSourcesFromRuntimeDropPaths,
  readNativeClipboardImageSource,
  type MarkdownImageImportSource,
} from '@/components/editor/assets'
import { handlePlatePasteLink } from '@/components/plate/platePasteEnhancements'
import { cn } from '@/lib/utils'
import { onRuntimeWebviewFileDrop } from '@/runtime/webview'
import { isDesktopRuntime } from '@/runtime/environment'

export type PlateAssetImporter = (
  sources: readonly MarkdownImageImportSource[],
  insertImage: (url: string, alt?: string) => boolean,
  signal: AbortSignal,
) => Promise<boolean>

type UsePlateAssetDropOptions = {
  canEdit?: () => boolean
  className?: string
  editor: PlateEditor
  enabled?: boolean
  importSources: PlateAssetImporter
  onImportError?: (error: Error) => void
  placeSelectionAtClientPoint?: (clientX: number, clientY: number) => boolean
  shellRef: RefObject<HTMLDivElement | null>
}

export const usePlateAssetDrop = ({
  canEdit = () => true,
  className,
  editor,
  enabled = true,
  importSources,
  onImportError,
  placeSelectionAtClientPoint,
  shellRef,
}: UsePlateAssetDropOptions) => {
  const mountedRef = useRef(true)
  const controllersRef = useRef(new Set<AbortController>())
  const [importCount, setImportCount] = useState(0)
  const placeSelection = useCallback(
    (clientX: number, clientY: number) =>
      placeSelectionAtClientPoint?.(clientX, clientY) ??
      placePlateSelectionAtClientPoint(editor, shellRef.current, clientX, clientY),
    [editor, placeSelectionAtClientPoint, shellRef],
  )
  const importImageSources = useCallback(
    async (sources: readonly MarkdownImageImportSource[]) => {
      if (!enabled || !canEdit() || sources.length === 0 || !mountedRef.current) return false
      const controller = new AbortController()
      controllersRef.current.add(controller)
      const target = captureInsertionTarget(editor)
      setImportCount((count) => count + 1)
      try {
        return await importSources(
          sources,
          (url, alt) => canEdit() && insertPlateImage(editor, target, url, alt),
          controller.signal,
        )
      } catch (error) {
        if (!controller.signal.aborted) {
          onImportError?.(error instanceof Error ? error : new Error(String(error)))
        }
        return false
      } finally {
        target?.unref()
        controllersRef.current.delete(controller)
        if (mountedRef.current) setImportCount((count) => Math.max(0, count - 1))
      }
    },
    [canEdit, editor, enabled, importSources, onImportError],
  )

  const importFiles = useCallback(
    async (files: File[], event: unknown) => {
      if (!canEdit()) return
      if (hasClientPoint(event)) placeSelection(event.clientX, event.clientY)
      const sources = imageSourcesFromClipboardData({ files, getData: () => '' })
      await importImageSources(sources)
    },
    [canEdit, importImageSources, placeSelection],
  )

  const { getRootProps, isDragAccept } = useDropzone({
    accept: { 'image/*': [] },
    disabled: !enabled,
    multiple: true,
    noClick: true,
    noKeyboard: true,
    onDropAccepted: (files, event) => void importFiles(files, event),
  })

  const handlePasteCapture = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      if (!enabled) return
      if (!canEdit()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      if (isComposing(event.nativeEvent)) return
      if (handlePlatePasteLink(editor, event.nativeEvent)) {
        event.stopPropagation()
        return
      }
      const sources = imageSourcesFromClipboardData(event.clipboardData)
      if (sources.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        void importImageSources(sources)
        return
      }
      if (event.clipboardData.getData('text/plain').trim()) return
      event.preventDefault()
      event.stopPropagation()
      void readNativeClipboardImageSource().then((source) => {
        if (source && mountedRef.current) void importImageSources([source])
      })
    },
    [canEdit, editor, enabled, importImageSources],
  )

  const handleDropCapture = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!enabled) return
      if (!canEdit()) {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      const sources = imagePathSourcesFromDropEvent(event)
      if (sources.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      placeSelection(event.clientX, event.clientY)
      void importImageSources(sources)
    },
    [canEdit, enabled, importImageSources, placeSelection],
  )

  useRuntimeImageDrop({
    enabled,
    importImageSources,
    placeSelectionAtClientPoint: placeSelection,
    shellRef,
  })

  useEffect(() => {
    const controllers = controllersRef.current
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllers.forEach((controller) => controller.abort())
      controllers.clear()
    }
  }, [])

  // react-dropzone intentionally composes these handlers with its internal ref callback.
  // eslint-disable-next-line react-hooks/refs
  const rootProps = getRootProps({
    className: cn(className, enabled && isDragAccept && 'is-image-drop-target'),
    onDragOverCapture: (event: DragEvent<HTMLDivElement>) => {
      if (enabled && canEdit() && hasImageDataTransfer(event.dataTransfer)) event.preventDefault()
    },
    onDropCapture: handleDropCapture,
    onPasteCapture: handlePasteCapture,
    'data-drop-active': enabled && isDragAccept ? 'image' : undefined,
    'data-import-active': importCount > 0 ? 'image' : undefined,
  }) as HTMLAttributes<HTMLDivElement> & { ref?: Ref<HTMLDivElement> }

  return {
    dropzoneRootProps: rootProps,
    importImageSources,
    importingImages: importCount > 0,
    setShellElement: (node: HTMLDivElement | null) => {
      assignRef(shellRef, node)
      assignRef(rootProps.ref, node)
    },
  }
}

type RangeRef = ReturnType<PlateEditor['api']['rangeRef']>

export const placePlateSelectionAtClientPoint = (
  editor: PlateEditor,
  root: HTMLElement | null,
  clientX: number,
  clientY: number,
) => {
  if (!root || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return false
  const target = root.ownerDocument.elementFromPoint(clientX, clientY)
  if (!target || !root.contains(target)) return false
  try {
    editor.tf.select(editor.api.findEventRange({ clientX, clientY, target }))
    return true
  } catch {
    return false
  }
}

const captureInsertionTarget = (editor: PlateEditor): RangeRef | null => {
  const end = editor.api.end([])
  const range: TRange | null = editor.selection ?? (end ? { anchor: end, focus: end } : null)
  return range ? editor.api.rangeRef(range) : null
}

const insertPlateImage = (editor: PlateEditor, target: RangeRef | null, url: string, alt = '') => {
  const destination = url.trim()
  const range = target?.current
  if (!destination || !range) return false
  editor.tf.select(range)
  editor.tf.insertNodes({ type: 'img', url: destination, alt, children: [{ text: '' }] })
  editor.tf.focus()
  return true
}

const useRuntimeImageDrop = ({
  enabled,
  importImageSources,
  placeSelectionAtClientPoint,
  shellRef,
}: {
  enabled: boolean
  importImageSources: (sources: readonly MarkdownImageImportSource[]) => Promise<boolean>
  placeSelectionAtClientPoint?: (clientX: number, clientY: number) => boolean
  shellRef: RefObject<HTMLDivElement | null>
}) => {
  useEffect(() => {
    if (!enabled || !isDesktopRuntime()) return
    let disposed = false
    let unlisten: (() => void) | null = null
    const subscribe = async () => {
      try {
        const nextUnlisten = await onRuntimeWebviewFileDrop((event) => {
          if (disposed) return
          const rect = shellRef.current?.getBoundingClientRect()
          if (!rect) return
          const clientX = event.position.x / Math.max(1, window.devicePixelRatio)
          const clientY = event.position.y / Math.max(1, window.devicePixelRatio)
          if (!insideRect(rect, clientX, clientY)) return
          const sources = imageSourcesFromRuntimeDropPaths(event.paths)
          if (sources.length === 0) return
          placeSelectionAtClientPoint?.(clientX, clientY)
          void importImageSources(sources)
        })
        if (disposed) nextUnlisten?.()
        else unlisten = nextUnlisten ?? null
      } catch {
        // The runtime may disappear during teardown; browser-only tests do not expose it.
      }
    }
    void subscribe()
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [enabled, importImageSources, placeSelectionAtClientPoint, shellRef])
}

const hasClientPoint = (event: unknown): event is { clientX: number; clientY: number } =>
  Boolean(event) &&
  typeof event === 'object' &&
  typeof (event as { clientX?: unknown }).clientX === 'number' &&
  typeof (event as { clientY?: unknown }).clientY === 'number'
const isComposing = (event: Event) =>
  Boolean((event as Event & { isComposing?: boolean }).isComposing)
const insideRect = (rect: DOMRect, x: number, y: number) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
const assignRef = <T>(ref: Ref<T> | undefined, value: T | null) => {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}
