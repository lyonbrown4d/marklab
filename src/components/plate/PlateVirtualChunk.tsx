import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export const PLATE_CHUNK_INTRINSIC_BLOCK_SIZE = 'auto 800px'

const PLATE_CHUNK_OVERSCAN = '900px 0px'
const PLATE_CHUNK_FALLBACK_HEIGHT = 800
const PLATE_CHUNK_REVEAL_EVENT = 'marklab:plate-reveal-chunk'

type PlateChunkRevealDetail = {
  blockId: string
  releases: Array<() => void>
}

export type PlateVirtualChunkRevealToken = {
  release: () => void
}

type PlateVirtualChunkProps = {
  attributes: { 'data-slate-chunk': true }
  children: ReactNode
}

const takeMeasuredHeight = (entry: IntersectionObserverEntry, element: HTMLElement) => {
  const measured = Math.max(entry.boundingClientRect.height, element.getBoundingClientRect().height)
  return measured > 0 ? Math.ceil(measured) : PLATE_CHUNK_FALLBACK_HEIGHT
}

export const revealPlateVirtualChunk = (editor: HTMLElement, blockId: string) => {
  const detail: PlateChunkRevealDetail = { blockId, releases: [] }
  editor.dispatchEvent(
    new CustomEvent<PlateChunkRevealDetail>(PLATE_CHUNK_REVEAL_EVENT, { detail }),
  )
  if (detail.releases.length === 0) return null
  let released = false
  return {
    release: () => {
      if (released) return
      released = true
      detail.releases.forEach((release) => release())
    },
  } satisfies PlateVirtualChunkRevealToken
}

export const PlateVirtualChunk = ({ attributes, children }: PlateVirtualChunkProps) => {
  const chunkRef = useRef<HTMLDivElement | null>(null)
  const isIntersectingRef = useRef(true)
  const [height, setHeight] = useState(PLATE_CHUNK_FALLBACK_HEIGHT)
  const [mounted, setMounted] = useState(true)
  const blockIdsRef = useRef<Set<string>>(new Set())
  const revealCountRef = useRef(0)
  const temporarilyMountedRef = useRef(false)

  const rememberBlockIds = useCallback(() => {
    const chunk = chunkRef.current
    if (!chunk) return
    const blockIds = new Set<string>()
    chunk.querySelectorAll<HTMLElement>('[data-block-id]').forEach((block) => {
      if (block.dataset.blockId) blockIds.add(block.dataset.blockId)
    })
    if (blockIds.size > 0) blockIdsRef.current = blockIds
  }, [])

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
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

      rememberBlockIds()
      setHeight(takeMeasuredHeight(entry, chunk))
      if (revealCountRef.current === 0) setMounted(false)
    },
    [rememberBlockIds],
  )

  useLayoutEffect(() => {
    if (mounted) rememberBlockIds()
  }, [children, mounted, rememberBlockIds])

  useEffect(() => {
    const chunk = chunkRef.current
    if (!chunk || typeof IntersectionObserver !== 'function') return

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: PLATE_CHUNK_OVERSCAN,
    })
    const editor = chunk.closest<HTMLElement>('[data-slate-editor="true"]')
    let blurTimer: number | undefined
    const handleEditorFocus = () => setMounted(true)
    const handleReveal = (event: Event) => {
      const detail = (event as CustomEvent<PlateChunkRevealDetail>).detail
      if (!detail || !blockIdsRef.current.has(detail.blockId)) return
      if (revealCountRef.current === 0 && chunk.dataset.plateVirtualState === 'recycled') {
        temporarilyMountedRef.current = true
        setMounted(true)
      }
      revealCountRef.current += 1
      let released = false
      detail.releases.push(() => {
        if (released) return
        released = true
        revealCountRef.current = Math.max(0, revealCountRef.current - 1)
        if (revealCountRef.current > 0 || !temporarilyMountedRef.current) return
        temporarilyMountedRef.current = false
        if (!isIntersectingRef.current) setMounted(false)
      })
    }
    const handleEditorBlur = () => {
      blurTimer = window.setTimeout(() => {
        blurTimer = undefined
        if (
          !editor?.contains(document.activeElement) &&
          !isIntersectingRef.current &&
          revealCountRef.current === 0
        ) {
          rememberBlockIds()
          const measured = chunk.getBoundingClientRect().height
          if (measured > 0) setHeight(Math.ceil(measured))
          setMounted(false)
        }
      })
    }
    observer.observe(chunk)
    editor?.addEventListener('focus', handleEditorFocus, { capture: true })
    editor?.addEventListener('blur', handleEditorBlur, { capture: true })
    editor?.addEventListener(PLATE_CHUNK_REVEAL_EVENT, handleReveal)
    return () => {
      if (blurTimer !== undefined) window.clearTimeout(blurTimer)
      observer.disconnect()
      editor?.removeEventListener('focus', handleEditorFocus, { capture: true })
      editor?.removeEventListener('blur', handleEditorBlur, { capture: true })
      editor?.removeEventListener(PLATE_CHUNK_REVEAL_EVENT, handleReveal)
    }
  }, [handleIntersection, rememberBlockIds])

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
