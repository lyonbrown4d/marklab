import { type RefObject, useEffect } from 'react'
import { ANIMATED_CURSOR_VIEWPORT_EVENT } from '@/components/plate/animatedCursorViewport'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const SCROLL_TRANSITION_DELAY_MS = 80
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
    let scrollTimer: number | null = null
    let composing = false

    const setVisible = (visible: boolean) => {
      caret.classList.toggle('is-visible', visible)
      root.classList.toggle('marklab-animated-cursor-host', visible)
    }

    const updateCaret = () => {
      animationFrame = null
      const selection = document.getSelection()
      const focusInside = document.activeElement === root || root.contains(document.activeElement)
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
      const rect = range.getBoundingClientRect()
      if (![rect.left, rect.top, rect.height].every(Number.isFinite)) {
        setVisible(false)
        return
      }
      const editorColor = view.getComputedStyle(root).color
      if (editorColor) caret.style.setProperty('--marklab-caret-color', editorColor)
      caret.style.setProperty('--marklab-caret-x', `${rect.left - CURSOR_WIDTH / 2}px`)
      caret.style.setProperty('--marklab-caret-y', `${rect.top}px`)
      caret.style.setProperty('--marklab-caret-height', `${Math.max(14, rect.height)}px`)
      setVisible(true)
    }

    const scheduleUpdate = () => {
      if (animationFrame !== null) return
      animationFrame = view.requestAnimationFrame(updateCaret)
    }
    const handleCompositionStart = () => {
      composing = true
      scheduleUpdate()
    }
    const handleCompositionEnd = () => {
      composing = false
      scheduleUpdate()
    }
    const handleWindowBlur = () => setVisible(false)
    const handleScroll = () => {
      caret.classList.add('is-tracking-scroll')
      if (scrollTimer) view.clearTimeout(scrollTimer)
      scrollTimer = view.setTimeout(
        () => caret.classList.remove('is-tracking-scroll'),
        SCROLL_TRANSITION_DELAY_MS,
      )
      scheduleUpdate()
    }

    const preferenceObserver = new MutationObserver(scheduleUpdate)
    preferenceObserver.observe(document.documentElement, {
      attributeFilter: ['class', 'data-motion-cursor', 'data-theme'],
      attributes: true,
    })
    document.addEventListener('selectionchange', scheduleUpdate)
    root.addEventListener('focus', scheduleUpdate)
    root.addEventListener('blur', scheduleUpdate)
    root.addEventListener('compositionstart', handleCompositionStart)
    root.addEventListener('compositionend', handleCompositionEnd)
    root.addEventListener('scroll', handleScroll, { capture: true, passive: true })
    cursorViewport?.addEventListener(ANIMATED_CURSOR_VIEWPORT_EVENT, scheduleUpdate)
    view.addEventListener('blur', handleWindowBlur)
    view.addEventListener('focus', scheduleUpdate)
    view.addEventListener('resize', scheduleUpdate)
    motionPreference.addEventListener('change', scheduleUpdate)
    scheduleUpdate()

    return () => {
      if (animationFrame !== null) view.cancelAnimationFrame(animationFrame)
      if (scrollTimer) view.clearTimeout(scrollTimer)
      preferenceObserver.disconnect()
      document.removeEventListener('selectionchange', scheduleUpdate)
      root.removeEventListener('focus', scheduleUpdate)
      root.removeEventListener('blur', scheduleUpdate)
      root.removeEventListener('compositionstart', handleCompositionStart)
      root.removeEventListener('compositionend', handleCompositionEnd)
      root.removeEventListener('scroll', handleScroll, true)
      cursorViewport?.removeEventListener(ANIMATED_CURSOR_VIEWPORT_EVENT, scheduleUpdate)
      view.removeEventListener('blur', handleWindowBlur)
      view.removeEventListener('focus', scheduleUpdate)
      view.removeEventListener('resize', scheduleUpdate)
      motionPreference.removeEventListener('change', scheduleUpdate)
      root.classList.remove('marklab-animated-cursor-host')
      caret.remove()
    }
  }, [editableRef, enabled])
}
