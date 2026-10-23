import { type KeyboardEvent, type RefObject } from 'react'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'
import {
  ZoomableVisualViewport,
  type ZoomableVisual,
} from '@/components/previews/ZoomableVisualViewport'
import { Dialog, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ResizableDialogContent } from '@/components/ui/ResizableDialogContent'
import { useI18n } from '@/i18n/useI18n'

type DiagramPreviewDialogProps = {
  labels: {
    resetZoom: string
    title: string
    zoomIn: string
    zoomLevel: string
    zoomOut: string
  }
  onOpenChange: (open: boolean) => void
  open: boolean
  returnFocusRef: RefObject<HTMLButtonElement | null>
  visual: ZoomableVisual
}

const stopEditorEvent = (event: { stopPropagation: () => void }) => event.stopPropagation()

export const DiagramPreviewDialog = ({
  labels,
  onOpenChange,
  open,
  returnFocusRef,
  visual,
}: DiagramPreviewDialogProps) => {
  const { t } = useI18n()
  useNativeSurfaceOcclusion('diagram-preview-dialog', open, { blocksCommandPalette: true })

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResizableDialogContent
        className="flex transform-gpu flex-col gap-0 p-0 will-change-auto"
        resizeLabels={{
          width: t('preview.resizeWidth'),
          height: t('preview.resizeHeight'),
          size: t('preview.resizeSize'),
        }}
        onClick={stopEditorEvent}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocusRef.current?.focus()
        }}
        onEscapeKeyDown={stopEditorEvent}
        onKeyDown={handleKeyDown}
        onMouseDown={stopEditorEvent}
        onPointerDown={stopEditorEvent}
      >
        <DialogHeader className="border-b border-border px-4 py-3 pr-14 text-left">
          <DialogTitle className="truncate text-sm">{labels.title}</DialogTitle>
        </DialogHeader>
        <ZoomableVisualViewport labels={labels} visual={visual} />
      </ResizableDialogContent>
    </Dialog>
  )
}
