export const DEFAULT_DROP_INDICATOR_GUTTER_OFFSET_PX = -38
export const DEFAULT_DROP_INDICATOR_MIN_WIDTH_PX = 64
export const DROP_INDICATOR_AUTO_SCROLL_EDGE_PX = 56

export type RectLike = Pick<DOMRect, 'bottom' | 'left' | 'right' | 'top'>

type DropIndicatorLayoutOptions = {
  blockRect: RectLike
  clientY: number
  clampRect: RectLike
  gutterOffsetPx?: number
  minWidthPx?: number
}

export type MarkdownDropIndicatorPosition = 'after' | 'before'

export type MarkdownDropIndicatorLayout = {
  position: MarkdownDropIndicatorPosition
  width: number
  x: number
  y: number
}

export const getDropIndicatorPosition = (
  clientY: number,
  blockRect: RectLike,
): MarkdownDropIndicatorPosition => {
  return clientY < (blockRect.top + blockRect.bottom) / 2 ? 'before' : 'after'
}

export const getDropIndicatorLayout = ({
  blockRect,
  clientY,
  clampRect,
  gutterOffsetPx = DEFAULT_DROP_INDICATOR_GUTTER_OFFSET_PX,
  minWidthPx = DEFAULT_DROP_INDICATOR_MIN_WIDTH_PX,
}: DropIndicatorLayoutOptions): MarkdownDropIndicatorLayout => {
  const position = getDropIndicatorPosition(clientY, blockRect)
  const x = Math.max(clampRect.left, blockRect.left + gutterOffsetPx)
  const right = Math.min(blockRect.right, clampRect.right)
  const width = Math.max(minWidthPx, right - x)
  const y = position === 'before' ? blockRect.top : blockRect.bottom

  return {
    position,
    width: roundPixel(width),
    x: roundPixel(x),
    y: roundPixel(y),
  }
}

export const parseCssPixelValue = (value: string, fallback: number) => {
  const normalizedValue = value.trim()
  if (!normalizedValue.endsWith('px')) return fallback

  const pixelValue = Number.parseFloat(normalizedValue)
  return Number.isFinite(pixelValue) ? pixelValue : fallback
}

export const shouldAllowEdgeAutoScroll = (
  event: Pick<DragEvent, 'clientY'>,
  viewport: HTMLElement,
) => {
  const rect = viewport.getBoundingClientRect()
  return (
    event.clientY - rect.top < DROP_INDICATOR_AUTO_SCROLL_EDGE_PX ||
    rect.bottom - event.clientY < DROP_INDICATOR_AUTO_SCROLL_EDGE_PX
  )
}

export const hasVisibleRect = ({ bottom, left, right, top }: RectLike) => {
  return right > left && bottom > top
}

const roundPixel = (value: number) => Math.round(value * 100) / 100
