import { useCallback, useEffect, useRef, type ComponentProps, type WheelEvent } from 'react'

import { ScrollArea as ShadcnScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/store/usePreferencesStore'

type AppScrollAreaProps = ComponentProps<typeof ShadcnScrollArea> & {
  smoothWheel?: boolean
  viewportClassName?: string
}

const SMOOTH_WHEEL_DURATION_MS = 170

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3)

const getWheelDeltaY = (event: WheelEvent<HTMLDivElement>, viewport: HTMLDivElement) => {
  if (event.deltaMode === 1) return event.deltaY * 16
  if (event.deltaMode === 2) return event.deltaY * viewport.clientHeight
  return event.deltaY
}

const shouldSkipSmoothWheel = (event: WheelEvent<HTMLDivElement>) => {
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

export const ScrollArea = ({
  children,
  className,
  onWheel,
  smoothWheel = false,
  viewportClassName,
  ...props
}: AppScrollAreaProps) => {
  const motionSmoothScrolling = usePreferencesStore((state) => state.motionSmoothScrolling)
  const animationFrameRef = useRef<number | null>(null)
  const animationStartRef = useRef(0)
  const scrollStartRef = useRef(0)
  const scrollTargetRef = useRef(0)
  const viewportRef = useRef<HTMLDivElement | null>(null)

  const cancelSmoothScroll = useCallback(() => {
    if (animationFrameRef.current === null) return
    window.cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
  }, [])

  const startSmoothScroll = useCallback(() => {
    const step = (time: number) => {
      const viewport = viewportRef.current
      if (!viewport) {
        animationFrameRef.current = null
        return
      }
      const progress = clamp((time - animationStartRef.current) / SMOOTH_WHEEL_DURATION_MS, 0, 1)
      viewport.scrollTop =
        scrollStartRef.current +
        (scrollTargetRef.current - scrollStartRef.current) * easeOutCubic(progress)
      animationFrameRef.current = progress < 1 ? window.requestAnimationFrame(step) : null
    }
    animationFrameRef.current = window.requestAnimationFrame(step)
  }, [])

  useEffect(() => cancelSmoothScroll, [cancelSmoothScroll])

  const handleWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      onWheel?.(event)
      if (
        event.defaultPrevented ||
        !smoothWheel ||
        !motionSmoothScrolling ||
        shouldSkipSmoothWheel(event) ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return
      }
      const viewport = event.currentTarget.querySelector<HTMLDivElement>(
        ':scope > [data-slot="scroll-area-viewport"]',
      )
      if (!viewport) return
      viewportRef.current = viewport
      const maxScrollTop = viewport.scrollHeight - viewport.clientHeight
      const deltaY = getWheelDeltaY(event, viewport)
      if (maxScrollTop <= 0 || deltaY === 0) return
      const currentScrollTop = viewport.scrollTop
      const base = animationFrameRef.current === null ? currentScrollTop : scrollTargetRef.current
      const target = clamp(base + deltaY, 0, maxScrollTop)
      if (target === currentScrollTop) return

      event.preventDefault()
      cancelSmoothScroll()
      scrollStartRef.current = currentScrollTop
      scrollTargetRef.current = target
      animationStartRef.current = performance.now()
      startSmoothScroll()
    },
    [cancelSmoothScroll, motionSmoothScrolling, onWheel, smoothWheel, startSmoothScroll],
  )

  return (
    <ShadcnScrollArea
      data-slot="app-scroll-area"
      className={cn('overflow-hidden', className)}
      onWheel={handleWheel}
      {...props}
    >
      <div className={viewportClassName}>{children}</div>
    </ShadcnScrollArea>
  )
}
