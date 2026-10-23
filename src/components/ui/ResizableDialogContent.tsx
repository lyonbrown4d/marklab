import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { DialogContent } from '@/components/ui/dialog'
import { useDialogResize, type DialogResizeDirection } from '@/components/ui/useDialogResize'

const handles: Record<DialogResizeDirection, string> = {
  n: 'inset-x-3 top-0 h-2 cursor-row-resize',
  e: 'inset-y-3 right-0 w-2 cursor-col-resize',
  s: 'inset-x-3 bottom-0 h-2 cursor-row-resize',
  w: 'inset-y-3 left-0 w-2 cursor-col-resize',
  ne: 'top-0 right-0 size-3 cursor-nesw-resize',
  nw: 'top-0 left-0 size-3 cursor-nwse-resize',
  se: 'right-0 bottom-0 size-3 cursor-nwse-resize',
  sw: 'bottom-0 left-0 size-3 cursor-nesw-resize',
}

type Props = Omit<ComponentProps<typeof DialogContent>, 'ref'> & {
  resizeLabels: { width: string; height: string; size: string }
}

export const ResizableDialogContent = ({
  children,
  className,
  resizeLabels,
  style,
  ...props
}: Props) => {
  const { dialogRef, size, minimum, maximum, bind, onKeyDown } = useDialogResize(true)
  return (
    <DialogContent
      {...props}
      ref={dialogRef}
      className={cn('max-h-[96vh] max-w-[96vw] overflow-hidden sm:max-w-[96vw]', className)}
      style={{ ...style, ...size }}
    >
      {children}
      {(Object.keys(handles) as DialogResizeDirection[]).map((direction) => {
        const corner = direction.length === 2
        const axis = direction === 'n' || direction === 's' ? 'height' : 'width'
        return (
          <div
            {...bind(direction)}
            key={direction}
            data-resize-direction={direction}
            role={corner ? 'button' : 'separator'}
            tabIndex={direction === 'e' || direction === 's' ? 0 : -1}
            aria-label={resizeLabels[corner ? 'size' : axis]}
            aria-orientation={corner ? undefined : axis === 'width' ? 'vertical' : 'horizontal'}
            aria-valuemin={corner ? undefined : Math.round(minimum[axis])}
            aria-valuemax={corner ? undefined : Math.round(maximum[axis])}
            aria-valuenow={corner ? undefined : Math.round(size[axis])}
            onKeyDown={(event) => onKeyDown(direction, event)}
            className={cn(
              'absolute z-10 touch-none rounded-sm hover:bg-border focus-visible:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              handles[direction],
            )}
          />
        )
      })}
    </DialogContent>
  )
}
