import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  getSvgDimensions,
  normalizeSvgSize,
  toPixelDelta,
  type VisualDimensions,
} from '@/components/previews/zoomableVisualGeometry'
import { Button } from '@/components/ui/button'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const ZOOM_STEP = 0.25
const WHEEL_ZOOM_SENSITIVITY = 0.0025

export type ZoomableVisual =
  | { kind: 'svg'; node: SVGSVGElement }
  | {
      alt: string
      kind: 'image'
      naturalHeight?: number
      naturalWidth?: number
      src: string
    }

type ZoomLabels = {
  resetZoom: string
  zoomIn: string
  zoomLevel: string
  zoomOut: string
}

type ZoomableVisualViewportProps = {
  labels: ZoomLabels
  visual: ZoomableVisual
}

type PanStart = {
  pointerId: number
  scrollLeft: number
  scrollTop: number
  x: number
  y: number
}

type ZoomAnchor = {
  contentX: number
  contentY: number
  pointerX: number
  pointerY: number
  viewport: HTMLDivElement
  zoom: number
}

type LoadedImageDimensions = VisualDimensions & { src: string }

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export const ZoomableVisualViewport = ({ labels, visual }: ZoomableVisualViewportProps) => {
  const panStartRef = useRef<PanStart | null>(null)
  const pendingZoomAnchorRef = useRef<ZoomAnchor | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const visualSurfaceRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef(1)
  const [loadedImageDimensions, setLoadedImageDimensions] = useState<LoadedImageDimensions | null>(
    null,
  )
  const [panning, setPanning] = useState(false)
  const [zoom, setZoom] = useState(1)
  const dimensions: VisualDimensions | null =
    visual.kind === 'svg'
      ? getSvgDimensions(visual.node)
      : visual.naturalHeight && visual.naturalWidth
        ? { height: visual.naturalHeight, width: visual.naturalWidth }
        : loadedImageDimensions?.src === visual.src
          ? loadedImageDimensions
          : null
  const setSvgOutputRef = useCallback(
    (output: HTMLDivElement | null) => {
      if (!output || visual.kind !== 'svg') return
      const clone = document.importNode(visual.node, true)
      normalizeSvgSize(clone)
      output.replaceChildren(clone)
    },
    [visual],
  )
  const changeZoom = (delta: number) =>
    setZoom((current) => {
      const next = clampZoom(current + delta)
      zoomRef.current = next
      return next
    })
  const resetZoom = () => {
    zoomRef.current = 1
    setZoom(1)
  }

  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current
    if (!anchor || anchor.zoom !== zoom) return
    const surface = visualSurfaceRef.current
    anchor.viewport.scrollLeft =
      (surface?.offsetLeft ?? 0) + anchor.contentX * zoom - anchor.pointerX
    anchor.viewport.scrollTop = (surface?.offsetTop ?? 0) + anchor.contentY * zoom - anchor.pointerY
    pendingZoomAnchorRef.current = null
  }, [zoom])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const handleWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const deltaX = toPixelDelta(event.deltaX, event.deltaMode, viewport.clientWidth)
      const deltaY = toPixelDelta(event.deltaY, event.deltaMode, viewport.clientHeight)

      if (!event.ctrlKey && !event.metaKey) {
        if (event.shiftKey && deltaX === 0) viewport.scrollLeft += deltaY
        else {
          viewport.scrollLeft += deltaX
          viewport.scrollTop += deltaY
        }
        return
      }

      if (deltaY === 0) return
      const currentZoom = zoomRef.current
      const nextZoom = clampZoom(currentZoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY))
      if (nextZoom === currentZoom) return
      const bounds = viewport.getBoundingClientRect()
      const pointerX = event.clientX - bounds.left
      const pointerY = event.clientY - bounds.top
      const surface = visualSurfaceRef.current
      pendingZoomAnchorRef.current = {
        contentX: (viewport.scrollLeft + pointerX - (surface?.offsetLeft ?? 0)) / currentZoom,
        contentY: (viewport.scrollTop + pointerY - (surface?.offsetTop ?? 0)) / currentZoom,
        pointerX,
        pointerY,
        viewport,
        zoom: nextZoom,
      }
      zoomRef.current = nextZoom
      setZoom(nextZoom)
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [])
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    panStartRef.current = {
      pointerId: event.pointerId,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
      x: event.clientX,
      y: event.clientY,
    }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setPanning(true)
  }
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return
    event.preventDefault()
    event.currentTarget.scrollLeft = start.scrollLeft + start.x - event.clientX
    event.currentTarget.scrollTop = start.scrollTop + start.y - event.clientY
  }
  const stopPanning = (event: PointerEvent<HTMLDivElement>) => {
    if (panStartRef.current?.pointerId !== event.pointerId) return
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    panStartRef.current = null
    setPanning(false)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        className="flex h-11 shrink-0 items-center justify-end gap-1 border-b border-border px-3"
        role="group"
        aria-label={labels.zoomLevel}
      >
        <Button
          aria-label={labels.zoomOut}
          disabled={zoom <= MIN_ZOOM}
          onClick={() => changeZoom(-ZOOM_STEP)}
          size="icon"
          title={labels.zoomOut}
          type="button"
          variant="ghost"
        >
          <Minus />
        </Button>
        <output aria-label={labels.zoomLevel} className="w-14 text-center text-xs tabular-nums">
          {Math.round(zoom * 100)}%
        </output>
        <Button
          aria-label={labels.zoomIn}
          disabled={zoom >= MAX_ZOOM}
          onClick={() => changeZoom(ZOOM_STEP)}
          size="icon"
          title={labels.zoomIn}
          type="button"
          variant="ghost"
        >
          <Plus />
        </Button>
        <Button
          aria-label={labels.resetZoom}
          disabled={zoom === 1}
          onClick={resetZoom}
          size="icon"
          title={labels.resetZoom}
          type="button"
          variant="ghost"
        >
          <RotateCcw />
        </Button>
      </div>
      <div
        ref={viewportRef}
        aria-label={labels.zoomLevel}
        className="min-h-0 flex-1 cursor-grab select-none overflow-auto overscroll-contain p-4 outline-none ring-inset [contain:layout_paint_style] data-[panning=true]:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
        data-panning={panning}
        onPointerCancel={stopPanning}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        role="region"
        tabIndex={0}
      >
        <div
          ref={visualSurfaceRef}
          className="relative mx-auto w-fit shrink-0"
          data-visual-spacer
          style={
            dimensions
              ? { height: dimensions.height * zoom, width: dimensions.width * zoom }
              : undefined
          }
        >
          <div
            ref={visual.kind === 'svg' ? setSvgOutputRef : undefined}
            className={`${dimensions ? 'absolute left-0 top-0' : 'relative'} origin-top-left [&_svg]:max-w-none`}
            data-visual-transform
            style={{ transform: `translate3d(0px, 0px, 0px) scale(${zoom})` }}
          >
            {visual.kind === 'image' ? (
              <img
                alt={visual.alt}
                className="max-w-none object-contain"
                draggable={false}
                onLoad={(event) => {
                  if (visual.naturalHeight && visual.naturalWidth) return
                  const { naturalHeight, naturalWidth } = event.currentTarget
                  if (naturalHeight <= 0 || naturalWidth <= 0) return
                  setLoadedImageDimensions({
                    height: naturalHeight,
                    src: visual.src,
                    width: naturalWidth,
                  })
                }}
                src={visual.src}
                style={{ height: visual.naturalHeight, width: visual.naturalWidth }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
