import * as React from 'react'
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area'

import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'

export interface ScrollAreaProps extends React.ComponentPropsWithoutRef<
  typeof ScrollAreaPrimitive.Root
> {
  viewportClassName?: string
  smoothWheel?: boolean
}

const SMOOTH_WHEEL_DURATION_MS = 170

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3)

const getWheelDeltaY = (event: React.WheelEvent<HTMLDivElement>, viewport: HTMLDivElement) => {
  if (event.deltaMode === 1) return event.deltaY * 16
  if (event.deltaMode === 2) return event.deltaY * viewport.clientHeight
  return event.deltaY
}

const shouldSkipSmoothWheel = (event: React.WheelEvent<HTMLDivElement>) => {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return true
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return true

  const target = event.target
  if (!(target instanceof HTMLElement)) return false

  return Boolean(
    target.closest(
      ['input', 'textarea', 'select', '.cm-editor', '.monaco-editor', '.xterm'].join(','),
    ),
  )
}

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollAreaProps
>(({ className, children, viewportClassName, smoothWheel = true, ...props }, ref) => {
  const motionSmoothScrolling = useAppStore((state) => state.motionSmoothScrolling)
  const smoothWheelEnabled = smoothWheel && motionSmoothScrolling
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const animationFrameRef = React.useRef<number | null>(null)
  const animationStartRef = React.useRef(0)
  const scrollStartRef = React.useRef(0)
  const scrollTargetRef = React.useRef(0)

  const cancelSmoothScroll = React.useCallback(() => {
    if (animationFrameRef.current === null) return
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
  }, [])

  const animateScroll = React.useCallback((time: number) => {
    const viewport = viewportRef.current
    if (!viewport) {
      animationFrameRef.current = null
      return
    }

    const elapsed = time - animationStartRef.current
    const progress = clamp(elapsed / SMOOTH_WHEEL_DURATION_MS, 0, 1)
    const easedProgress = easeOutCubic(progress)
    viewport.scrollTop =
      scrollStartRef.current + (scrollTargetRef.current - scrollStartRef.current) * easedProgress

    if (progress < 1) {
      animationFrameRef.current = window.requestAnimationFrame(animateScroll)
      return
    }

    animationFrameRef.current = null
  }, [])

  React.useEffect(() => cancelSmoothScroll, [cancelSmoothScroll])

  const handleWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const viewport = viewportRef.current
      if (!smoothWheelEnabled || !viewport || shouldSkipSmoothWheel(event)) return
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight
      if (maxScrollTop <= 0) return

      const deltaY = getWheelDeltaY(event, viewport)
      if (deltaY === 0) return

      const currentScrollTop = viewport.scrollTop
      const nextBase =
        animationFrameRef.current === null ? currentScrollTop : scrollTargetRef.current
      const nextTarget = clamp(nextBase + deltaY, 0, maxScrollTop)

      if (nextTarget === currentScrollTop) return

      event.preventDefault()
      cancelSmoothScroll()

      scrollStartRef.current = currentScrollTop
      scrollTargetRef.current = nextTarget
      animationStartRef.current = performance.now()
      animationFrameRef.current = window.requestAnimationFrame(animateScroll)
    },
    [animateScroll, cancelSmoothScroll, smoothWheelEnabled],
  )

  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className={cn('motion-scroll-viewport h-full w-full rounded-[inherit]', viewportClassName)}
        onWheel={handleWheel}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
})

ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(
      'flex touch-none select-none transition-colors',
      orientation === 'vertical' && 'h-full w-2.5 border-l border-l-transparent p-[1px]',
      orientation === 'horizontal' && 'h-2.5 flex-col border-t border-t-transparent p-[1px]',
      className,
    )}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="relative flex-1 rounded-full bg-border/80" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
))

ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName

export { ScrollArea, ScrollBar }
