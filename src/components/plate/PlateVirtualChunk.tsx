import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

export const PLATE_CHUNK_INTRINSIC_BLOCK_SIZE = 'auto 800px'

const PLATE_CHUNK_OVERSCAN = '900px 0px'
const PLATE_CHUNK_FALLBACK_HEIGHT = 800

type PlateVirtualChunkProps = {
  attributes: { 'data-slate-chunk': true }
  children: ReactNode
}

const takeMeasuredHeight = (entry: IntersectionObserverEntry, element: HTMLElement) => {
  const measured = Math.max(entry.boundingClientRect.height, element.getBoundingClientRect().height)
  return measured > 0 ? Math.ceil(measured) : PLATE_CHUNK_FALLBACK_HEIGHT
}

export const PlateVirtualChunk = ({ attributes, children }: PlateVirtualChunkProps) => {
  const chunkRef = useRef<HTMLDivElement | null>(null)
  const isIntersectingRef = useRef(true)
  const [height, setHeight] = useState(PLATE_CHUNK_FALLBACK_HEIGHT)
  const [mounted, setMounted] = useState(true)

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    const entry = entries[0]
    const chunk = chunkRef.current
    if (!entry || !chunk) return
    isIntersectingRef.current = entry.isIntersecting

    if (entry.isIntersecting) {
      setMounted(true)
      return
    }

    const editor = chunk.closest<HTMLElement>('[data-slate-editor="true"]')
    if (editor?.contains(document.activeElement)) return

    setHeight(takeMeasuredHeight(entry, chunk))
    setMounted(false)
  }, [])

  useEffect(() => {
    const chunk = chunkRef.current
    if (!chunk || typeof IntersectionObserver !== 'function') return

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: PLATE_CHUNK_OVERSCAN,
    })
    const editor = chunk.closest<HTMLElement>('[data-slate-editor="true"]')
    let blurTimer: number | undefined
    const handleEditorFocus = () => setMounted(true)
    const handleEditorBlur = () => {
      blurTimer = window.setTimeout(() => {
        blurTimer = undefined
        if (!editor?.contains(document.activeElement) && !isIntersectingRef.current) {
          const measured = chunk.getBoundingClientRect().height
          if (measured > 0) setHeight(Math.ceil(measured))
          setMounted(false)
        }
      })
    }
    observer.observe(chunk)
    editor?.addEventListener('focus', handleEditorFocus, { capture: true })
    editor?.addEventListener('blur', handleEditorBlur, { capture: true })
    return () => {
      if (blurTimer !== undefined) window.clearTimeout(blurTimer)
      observer.disconnect()
      editor?.removeEventListener('focus', handleEditorFocus, { capture: true })
      editor?.removeEventListener('blur', handleEditorBlur, { capture: true })
    }
  }, [handleIntersection])

  const style: CSSProperties = {
    containIntrinsicBlockSize: PLATE_CHUNK_INTRINSIC_BLOCK_SIZE,
    contentVisibility: mounted ? 'auto' : 'hidden',
    height: mounted ? undefined : height,
  }

  return (
    <div
      {...attributes}
      data-plate-virtual-state={mounted ? 'mounted' : 'recycled'}
      ref={chunkRef}
      style={style}
    >
      {mounted ? children : null}
    </div>
  )
}
