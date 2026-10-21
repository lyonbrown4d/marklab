import { autoUpdate, getOverflowAncestors } from '@platejs/floating'
import { type RefObject, useEffect } from 'react'
import { ANIMATED_CURSOR_VIEWPORT_EVENT } from '@/components/plate/animatedCursorViewport'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const CURSOR_WIDTH = 2

type PlateAnimatedCursorOptions = {
  editableRef: RefObject<HTMLElement | null>
  enabled: boolean
}

export const usePlateAnimatedCursor = ({ editableRef, enabled }: PlateAnimatedCursorOptions) => {
  useEffect(() => {
    const root = editableRef.current
    const view = root?.ownerDocument.defaultView
    if (!enabled || !root || !view) return

    const document = root.ownerDocument
    const cursorViewport = root.closest<HTMLElement>('[data-marklab-cursor-viewport]')
    const motionPreference = view.matchMedia(REDUCED_MOTION_QUERY)
    const caret = document.createElement('span')
    caret.className = 'marklab-animated-caret'
    caret.dataset.marklabPlateOverlay = 'animated-cursor'
    caret.setAttribute('aria-hidden', 'true')
    document.body.append(caret)

    let animationFrame: number | null = null
    let composing = false
    let animateNextUpdate = false
    let previousTop: number | null = null
    let trackedBlock: Element | null = null
    let clippingAncestors: Element[] = []
    let stopAutoUpdate: (() => void) | undefined

    const setVisible = (visible: boolean) => {
      caret.classList.toggle('is-visible', visible)
      root.classList.toggle('marklab-animated-cursor-host', visible)
      if (!visible) {
        caret.classList.remove('is-animating')
        stopAutoUpdate?.()
        stopAutoUpdate = undefined
        trackedBlock = null
      }
    }

    const updateCaret = () => {
      animationFrame = null
      const selection = document.getSelection()
      const focusInside = document.activeElement === root
      const enabledByPreference =
        !motionPreference.matches && document.documentElement.dataset.motionCursor !== 'false'
      if (
        !enabledByPreference ||
        composing ||
        !document.hasFocus() ||
        !focusInside ||
        !selection?.isCollapsed ||
        selection.rangeCount === 0 ||
        !selection.anchorNode ||
        !root.contains(selection.anchorNode)
      ) {
        setVisible(false)
        return
      }

      const range = selection.getRangeAt(0)
      if (typeof range.getBoundingClientRect !== 'function') {
        setVisible(false)
        return
      }
      // A collapsed range at an inline/wrapped boundary can have multiple fragments.
      // Do not stretch the caret across their union or display an empty rect at (0, 0).
      const rect =
        [...(range.getClientRects?.() ?? [])].find((part) => part.height > 0 && part.width <= 1) ??
        range.getBoundingClientRect()
      if (rect.height <= 0 || ![rect.left, rect.top, rect.height].every(Number.isFinite)) {
        setVisible(false)
        return
      }
      const block =
        selection.anchorNode.parentElement?.closest('[data-slate-node="element"]') ?? root
      const ancestors =
        trackedBlock === block
          ? clippingAncestors
          : getOverflowAncestors(block).filter(
              (ancestor): ancestor is Element => ancestor instanceof view.Element,
            )
      if (
        ancestors.some((ancestor) => {
          const bounds = ancestor.getBoundingClientRect()
          return (
            bounds.width > 0 &&
            bounds.height > 0 &&
            (rect.top >= bounds.bottom ||
              rect.bottom <= bounds.top ||
              rect.left < bounds.left ||
              rect.left > bounds.right)
          )
        })
      ) {
        setVisible(false)
        return
      }
      const animate =
        animateNextUpdate &&
        caret.classList.contains('is-visible') &&
        previousTop !== null &&
        Math.abs(previousTop - rect.top) < 1
      animateNextUpdate = false
      previousTop = rect.top
      caret.classList.toggle('is-animating', animate)
      const editorColor = view.getComputedStyle(root).color
      if (editorColor) caret.style.setProperty('--marklab-caret-color', editorColor)
      caret.style.setProperty('--marklab-caret-x', `${rect.left - CURSOR_WIDTH / 2}px`)
      caret.style.setProperty('--marklab-caret-y', `${rect.top}px`)
      caret.style.setProperty('--marklab-caret-height', `${rect.height}px`)
      setVisible(true)
      if (trackedBlock !== block) {
        stopAutoUpdate?.()
        trackedBlock = block
        clippingAncestors = ancestors
        // Track the active block, not just the fixed-height editor viewport: table
        // resizing, font loading and preceding content can move text inside it.
        let initializing = true
        stopAutoUpdate = autoUpdate(
          block,
          caret,
          () => {
            if (!initializing) updateWithoutAnimation()
          },
          { ancestorScroll: false, layoutShift: typeof view.IntersectionObserver === 'function' },
        )
        initializing = false
      }
    }

    const scheduleUpdate = () => {
      if (animationFrame !== null) return
      animationFrame = view.requestAnimationFrame(updateCaret)
    }
    const updateWithoutAnimation = () => {
      animateNextUpdate = false
      scheduleUpdate()
    }
    const handleScroll = (event: Event) => {
      const target = event.target
      if (
        target instanceof view.Element &&
        target !== root &&
        !root.contains(target) &&
        !target.contains(root)
      )
        return
      updateWithoutAnimation()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      animateNextUpdate =
        !event.isComposing &&
        !event.shiftKey &&
        !event.altKey &&
        !event.ctrlKey &&
        !event.metaKey &&
        (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      scheduleUpdate()
    }
    const handleCompositionStart = () => {
      composing = true
      setVisible(false)
      updateWithoutAnimation()
    }
    const handleCompositionEnd = () => {
      composing = false
      updateWithoutAnimation()
    }
    const handleWindowBlur = () => setVisible(false)
    const preferenceObserver = new MutationObserver(updateWithoutAnimation)
    preferenceObserver.observe(document.documentElement, {
      attributeFilter: ['class', 'data-motion-cursor', 'data-theme'],
      attributes: true,
    })
    document.addEventListener('selectionchange', scheduleUpdate)
    root.addEventListener('focus', updateWithoutAnimation)
    root.addEventListener('blur', updateWithoutAnimation)
    root.addEventListener('keydown', handleKeyDown)
    root.addEventListener('input', updateWithoutAnimation)
    root.addEventListener('pointerdown', updateWithoutAnimation)
    root.addEventListener('compositionstart', handleCompositionStart)
    root.addEventListener('compositionend', handleCompositionEnd)
    document.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    cursorViewport?.addEventListener(ANIMATED_CURSOR_VIEWPORT_EVENT, updateWithoutAnimation)
    view.addEventListener('blur', handleWindowBlur)
    view.addEventListener('focus', updateWithoutAnimation)
    view.addEventListener('resize', updateWithoutAnimation)
    motionPreference.addEventListener('change', updateWithoutAnimation)
    scheduleUpdate()

    return () => {
      if (animationFrame !== null) view.cancelAnimationFrame(animationFrame)
      stopAutoUpdate?.()
      preferenceObserver.disconnect()
      document.removeEventListener('selectionchange', scheduleUpdate)
      root.removeEventListener('focus', updateWithoutAnimation)
      root.removeEventListener('blur', updateWithoutAnimation)
      root.removeEventListener('keydown', handleKeyDown)
      root.removeEventListener('input', updateWithoutAnimation)
      root.removeEventListener('pointerdown', updateWithoutAnimation)
      root.removeEventListener('compositionstart', handleCompositionStart)
      root.removeEventListener('compositionend', handleCompositionEnd)
      document.removeEventListener('scroll', handleScroll, true)
      cursorViewport?.removeEventListener(ANIMATED_CURSOR_VIEWPORT_EVENT, updateWithoutAnimation)
      view.removeEventListener('blur', handleWindowBlur)
      view.removeEventListener('focus', updateWithoutAnimation)
      view.removeEventListener('resize', updateWithoutAnimation)
      motionPreference.removeEventListener('change', updateWithoutAnimation)
      root.classList.remove('marklab-animated-cursor-host')
      caret.remove()
    }
  }, [editableRef, enabled])
}
