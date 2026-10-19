import { useCallback, useRef, useState } from 'react'
import { getWorkspaceMapViewportLod } from '@/pages/workspace-map/workspaceMapViewportLod'
import { notifyAnimatedCursorViewport } from '@/components/plate/animatedCursorViewport'

export const useWorkspaceMapViewport = () => {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const bindElement = useCallback(
    (next: HTMLDivElement | null) => {
      canvasRef.current = next
      setElement(next)
    },
    [canvasRef],
  )
  const [revision, setRevision] = useState(0)
  const [lod, setLod] = useState(() => getWorkspaceMapViewportLod(1))
  const onMove = useCallback(
    (_event: unknown, viewport: { zoom: number }) => {
      setLod((current) => {
        const next = getWorkspaceMapViewportLod(viewport.zoom)
        return current === next ? current : next
      })
      notifyAnimatedCursorViewport(canvasRef.current)
    },
    [canvasRef],
  )
  const settle = useCallback(() => setRevision((current) => current + 1), [])
  return { bindElement, element, lod, onMove, revision, settle }
}
