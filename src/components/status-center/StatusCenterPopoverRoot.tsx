import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Popover } from '@/components/ui/popover'
import { useNativeSurfaceOcclusion } from '@/app/nativeSurfaceOcclusion'

type StatusCenterPopoverRootProps = {
  children: (open: boolean) => ReactNode
  onVisibilityCloseFocus?: () => void
  visible: boolean
}

const focusAfterVisibilityClose = () => {
  requestAnimationFrame(() => {
    const edgeHandle = document.querySelector<HTMLElement>('[data-status-bar-edge-handle]')
    const editorZone = document.querySelector<HTMLElement>('[data-app-focus-zone="editor"]')
    const editorTarget = editorZone?.querySelector<HTMLElement>(
      '[contenteditable="true"], textarea, input, button, [tabindex]:not([tabindex="-1"])',
    )
    ;(edgeHandle ?? editorTarget ?? editorZone)?.focus()
  })
}

export const StatusCenterPopoverRoot = ({
  children,
  onVisibilityCloseFocus = focusAfterVisibilityClose,
  visible,
}: StatusCenterPopoverRootProps) => {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  useNativeSurfaceOcclusion('status-center', visible && open)

  useEffect(
    () => () => {
      if (openRef.current) onVisibilityCloseFocus()
    },
    [onVisibilityCloseFocus],
  )

  if (!visible) return null

  const handleOpenChange = (nextOpen: boolean) => {
    openRef.current = nextOpen
    setOpen(nextOpen)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {children(open)}
    </Popover>
  )
}
