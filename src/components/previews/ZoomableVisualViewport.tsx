import { useCallback, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const ZOOM_STEP = 0.25
const DEFAULT_SVG_WIDTH = 300
const DEFAULT_SVG_HEIGHT = 150
const PIXEL_LENGTH = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/i

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

const parsePixelLength = (value: string | null): number | null => {
  const normalized = value?.trim() ?? ''
  if (!PIXEL_LENGTH.test(normalized)) return null
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const parseViewBoxSize = (value: string | null) => {
  const values =
    value
      ?.trim()
      .split(/[\s,]+/)
      .map(Number) ?? []
  if (values.length !== 4) return null
  const width = values[2]
  const height = values[3]
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return { height, width }
}

const toPixelValue = (value: number) => `${Math.round(value * 1000) / 1000}px`

const normalizeSvgSize = (node: SVGSVGElement) => {
  const viewBox = parseViewBoxSize(node.getAttribute('viewBox'))
  const widthHint =
    parsePixelLength(node.style.maxWidth) ??
    parsePixelLength(node.style.width) ??
    parsePixelLength(node.getAttribute('width'))
  const heightHint =
    parsePixelLength(node.style.height) ?? parsePixelLength(node.getAttribute('height'))
  let width = widthHint ?? viewBox?.width ?? DEFAULT_SVG_WIDTH
  let height = heightHint ?? DEFAULT_SVG_HEIGHT
  if (viewBox && widthHint) height = (width * viewBox.height) / viewBox.width
  else if (viewBox && heightHint) width = (height * viewBox.width) / viewBox.height
  else if (viewBox) height = viewBox.height

  node.removeAttribute('height')
  node.removeAttribute('width')
  node.style.removeProperty('max-width')
  node.style.width = toPixelValue(width)
  node.style.height = toPixelValue(height)
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

export const ZoomableVisualViewport = ({ labels, visual }: ZoomableVisualViewportProps) => {
  const panStartRef = useRef<PanStart | null>(null)
  const [panning, setPanning] = useState(false)
  const [zoom, setZoom] = useState(1)
  const setSvgOutputRef = useCallback(
    (output: HTMLDivElement | null) => {
      if (!output || visual.kind !== 'svg') return
      const clone = document.importNode(visual.node, true)
      normalizeSvgSize(clone)
      output.replaceChildren(clone)
    },
    [visual],
  )
  const changeZoom = (delta: number) => setZoom((current) => clampZoom(current + delta))
  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    if (event.deltaY !== 0) changeZoom(event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
  }
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
          onClick={() => setZoom(1)}
          size="icon"
          title={labels.resetZoom}
          type="button"
          variant="ghost"
        >
          <RotateCcw />
        </Button>
      </div>
      <div
        aria-label={labels.zoomLevel}
        className="min-h-0 flex-1 cursor-grab select-none overflow-auto p-4 outline-none ring-inset data-[panning=true]:cursor-grabbing focus-visible:ring-2 focus-visible:ring-ring"
        data-panning={panning}
        onPointerCancel={stopPanning}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopPanning}
        onWheel={handleWheel}
        role="region"
        tabIndex={0}
      >
        <div
          ref={visual.kind === 'svg' ? setSvgOutputRef : undefined}
          className="mx-auto w-fit origin-top-left [&_svg]:max-w-none"
          style={{ zoom }}
        >
          {visual.kind === 'image' ? (
            <img
              alt={visual.alt}
              className="max-w-none object-contain"
              draggable={false}
              src={visual.src}
              style={{ height: visual.naturalHeight, width: visual.naturalWidth }}
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
