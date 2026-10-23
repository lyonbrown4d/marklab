import { useRef, useState, type KeyboardEvent } from 'react'
import { flushSync } from 'react-dom'
import { useDrag } from '@use-gesture/react'
import { useEventListener, useRafState } from 'ahooks'

export type DialogResizeDirection = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type Size = { width: number; height: number }

export const useDialogResize = (enabled: boolean) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useRafState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }))
  useEventListener('resize', () => {
    setViewport({ width: window.innerWidth, height: window.innerHeight })
  })
  const [preferredSize, setPreferredSize] = useState<Size>()
  const maximum = { width: viewport.width * 0.96, height: viewport.height * 0.96 }
  const minimum = { width: Math.min(480, maximum.width), height: Math.min(280, maximum.height) }
  const clamp = (size: Size): Size => ({
    width: Math.min(maximum.width, Math.max(minimum.width, size.width)),
    height: Math.min(maximum.height, Math.max(minimum.height, size.height)),
  })
  const size = clamp(
    preferredSize ?? { width: viewport.width * 0.92, height: viewport.height * 0.92 },
  )
  const current = (): Size => {
    const box = dialogRef.current?.getBoundingClientRect()
    return box && box.width && box.height ? { width: box.width, height: box.height } : size
  }
  const bind = useDrag(
    ({ first, movement: [x, y], memo, event, args }) => {
      event.stopPropagation()
      const direction = args[0] as DialogResizeDirection
      const initial: Size = first ? current() : memo
      // The dialog stays centered, so each edge travels half the size change.
      // Commit pointer geometry before a child's synchronous ResizeObserver
      // subscription can flush a pending ancestor resize during its delivery.
      flushSync(() => {
        setPreferredSize(
          clamp({
            width:
              initial.width + x * (direction.includes('e') ? 2 : direction.includes('w') ? -2 : 0),
            height:
              initial.height + y * (direction.includes('s') ? 2 : direction.includes('n') ? -2 : 0),
          }),
        )
      })
      return initial
    },
    { enabled, pointer: { keys: false }, preventDefault: true },
  )
  const onKeyDown = (direction: DialogResizeDirection, event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
      return
    event.preventDefault()
    event.stopPropagation()
    const step = event.shiftKey ? 64 : 16
    const horizontal = direction !== 'n' && direction !== 's'
    const vertical = direction !== 'e' && direction !== 'w'
    const next = { ...current() }
    for (const [axis, allowed, increase, decrease] of [
      ['width', horizontal, 'ArrowRight', 'ArrowLeft'],
      ['height', vertical, 'ArrowDown', 'ArrowUp'],
    ] as const) {
      if (!allowed) continue
      if (event.key === 'Home') next[axis] = minimum[axis]
      if (event.key === 'End') next[axis] = maximum[axis]
      if (event.key === increase) next[axis] += step
      if (event.key === decrease) next[axis] -= step
    }
    setPreferredSize(clamp(next))
  }

  return { dialogRef, size, minimum, maximum, bind, onKeyDown }
}
