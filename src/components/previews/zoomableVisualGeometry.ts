const DEFAULT_SVG_WIDTH = 300
const DEFAULT_SVG_HEIGHT = 150
const LINE_DELTA_PIXELS = 16
const PIXEL_LENGTH = /^(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/i

export type VisualDimensions = { height: number; width: number }

const parsePixelLength = (value: string | null): number | null => {
  const normalized = value?.trim() ?? ''
  if (!PIXEL_LENGTH.test(normalized)) return null
  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

const parseViewBoxSize = (value: string | null): VisualDimensions | null => {
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

const svgDimensions = (node: SVGSVGElement): VisualDimensions => {
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
  return { height, width }
}

const toPixelValue = (value: number) => `${Math.round(value * 1000) / 1000}px`

export const normalizeSvgSize = (node: SVGSVGElement): VisualDimensions => {
  const dimensions = svgDimensions(node)
  node.removeAttribute('height')
  node.removeAttribute('width')
  node.style.removeProperty('max-width')
  node.style.width = toPixelValue(dimensions.width)
  node.style.height = toPixelValue(dimensions.height)
  return dimensions
}

export const getSvgDimensions = (node: SVGSVGElement) => svgDimensions(node)

export const toPixelDelta = (delta: number, deltaMode: number, pageSize: number) => {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) return delta * LINE_DELTA_PIXELS
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return delta * pageSize
  return delta
}
