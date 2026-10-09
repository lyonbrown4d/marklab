import { DndPlugin, ScrollArea } from '@platejs/dnd'
import { usePluginOption } from 'platejs/react'
import type { CSSProperties, HTMLAttributes, RefObject } from 'react'

type PlateDndEdgeScrollerProps = {
  containerRef: RefObject<HTMLDivElement | null>
}

const EDGE_HEIGHT = 72

const createEdgeStyle = (placement: 'bottom' | 'top'): CSSProperties => ({
  [placement]: 0,
  height: EDGE_HEIGHT,
  insetInline: 0,
  opacity: 0,
  pointerEvents: 'auto',
  position: 'absolute',
  width: '100%',
  zIndex: 10_000,
})

const createScrollAreaProps = (placement: 'bottom' | 'top') =>
  ({
    'data-plate-dnd-scroll-area': placement,
    style: createEdgeStyle(placement),
  }) satisfies HTMLAttributes<HTMLDivElement> & {
    'data-plate-dnd-scroll-area': 'bottom' | 'top'
  }

export const PlateDndEdgeScroller = ({ containerRef }: PlateDndEdgeScrollerProps) => {
  const isDragging = usePluginOption(DndPlugin, 'isDragging')

  return (
    <>
      {(['top', 'bottom'] as const).map((placement) => (
        <ScrollArea
          containerRef={containerRef}
          enabled={isDragging}
          height={EDGE_HEIGHT}
          key={placement}
          minStrength={0.15}
          placement={placement}
          scrollAreaProps={createScrollAreaProps(placement)}
          strengthMultiplier={18}
        />
      ))}
    </>
  )
}
