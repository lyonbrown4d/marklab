import { Plugin } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const CURSOR_WIDTH = 2

const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return true
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

const isAnimatedCursorEnabled = () => {
  if (typeof document === 'undefined') return false
  return !prefersReducedMotion() && document.documentElement.dataset.motionCursor !== 'false'
}

const getCaretParent = (view: EditorView) => view.dom.parentElement ?? view.dom

const createAnimatedCursorView = (initialView: EditorView) => {
  if (prefersReducedMotion()) {
    return {
      update: () => {},
      destroy: () => {},
    }
  }

  let view = initialView
  let animationFrame: number | null = null
  const caretParent = getCaretParent(view)
  const scrollHost = view.dom.closest<HTMLElement>('.editor-scroll-viewport')
  const caret = document.createElement('span')
  caret.className = 'marklab-animated-caret'
  caret.setAttribute('aria-hidden', 'true')
  caretParent.appendChild(caret)

  const setVisible = (visible: boolean) => {
    caret.classList.toggle('is-visible', visible)
    view.dom.classList.toggle('marklab-animated-cursor-host', visible)
  }

  const updateCaret = () => {
    animationFrame = null
    const { selection } = view.state
    if (!isAnimatedCursorEnabled() || !selection.empty || !view.hasFocus()) {
      setVisible(false)
      return
    }

    try {
      const caretRect = view.coordsAtPos(selection.head)
      const parentRect = caretParent.getBoundingClientRect()
      const caretHeight = Math.max(14, caretRect.bottom - caretRect.top)
      const caretX = caretRect.left - parentRect.left - CURSOR_WIDTH / 2
      const caretY = caretRect.top - parentRect.top

      caret.style.setProperty('--marklab-caret-x', `${caretX}px`)
      caret.style.setProperty('--marklab-caret-y', `${caretY}px`)
      caret.style.setProperty('--marklab-caret-height', `${caretHeight}px`)
      setVisible(true)
    } catch {
      setVisible(false)
    }
  }

  const scheduleUpdate = () => {
    if (animationFrame !== null) return
    animationFrame = window.requestAnimationFrame(updateCaret)
  }

  const handleFocus = () => scheduleUpdate()
  const handleBlur = () => scheduleUpdate()
  const handleScroll = () => scheduleUpdate()
  const handleResize = () => scheduleUpdate()

  view.dom.addEventListener('focus', handleFocus)
  view.dom.addEventListener('blur', handleBlur)
  scrollHost?.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('resize', handleResize)
  scheduleUpdate()

  return {
    update(nextView: EditorView) {
      view = nextView
      scheduleUpdate()
    },
    destroy() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = null
      }
      view.dom.classList.remove('marklab-animated-cursor-host')
      view.dom.removeEventListener('focus', handleFocus)
      view.dom.removeEventListener('blur', handleBlur)
      scrollHost?.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleResize)
      caret.remove()
    },
  }
}

export const animatedCursor = $prose(() => {
  return new Plugin({
    view: createAnimatedCursorView,
  })
})
