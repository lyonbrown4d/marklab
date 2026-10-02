import { Plugin, type EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const CURSOR_WIDTH = 2
const SCROLL_SETTLE_DELAY_MS = 80

const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return true
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

const isAnimatedCursorEnabled = () => {
  if (typeof document === 'undefined') return false
  return !prefersReducedMotion() && document.documentElement.dataset.motionCursor !== 'false'
}

const isLargeDocumentEditor = (view: EditorView) =>
  view.dom.closest<HTMLElement>('.crepe')?.dataset.largeDocument === 'true'

const getScrollHost = (view: EditorView) =>
  view.dom.closest<HTMLElement>('.virtualized-markdown-editor') ??
  view.dom.closest<HTMLElement>('.milkdown') ??
  view.dom.closest<HTMLElement>('.editor-scroll-viewport')

export const createAnimatedCursorView = (initialView: EditorView) => {
  if (prefersReducedMotion()) {
    return {
      update: () => {},
      destroy: () => {},
    }
  }

  let view = initialView
  let animationFrame: number | null = null
  let scrollSettleTimer: number | null = null
  const scrollHost = getScrollHost(view)
  const caret = document.createElement('span')
  caret.className = 'marklab-animated-caret'
  caret.dataset.marklabPlaygroundOverlay = 'animated-cursor'
  caret.setAttribute('aria-hidden', 'true')
  document.body.appendChild(caret)

  const setVisible = (visible: boolean) => {
    caret.classList.toggle('is-visible', visible)
    view.dom.classList.toggle('marklab-animated-cursor-host', visible)
  }

  const updateCaret = () => {
    animationFrame = null
    const { selection } = view.state
    if (!isAnimatedCursorEnabled() || view.composing || !selection.empty || !view.hasFocus()) {
      setVisible(false)
      return
    }

    try {
      const caretRect = view.coordsAtPos(selection.head)
      const caretHeight = Math.max(14, caretRect.bottom - caretRect.top)
      const caretX = caretRect.left - CURSOR_WIDTH / 2
      const caretY = caretRect.top

      caret.style.setProperty('--marklab-caret-x', `${caretX}px`)
      caret.style.setProperty('--marklab-caret-y', `${caretY}px`)
      caret.style.setProperty('--marklab-caret-height', `${caretHeight}px`)
      setVisible(true)
    } catch {
      setVisible(false)
    }
  }

  const scheduleUpdate = () => {
    if (isLargeDocumentEditor(view)) {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      animationFrame = null
      setVisible(false)
      return
    }
    if (animationFrame !== null) return
    animationFrame = window.requestAnimationFrame(updateCaret)
  }

  const handleFocus = () => scheduleUpdate()
  const handleBlur = () => scheduleUpdate()
  const handleComposition = () => scheduleUpdate()
  const handleScroll = () => {
    if (animationFrame !== null) {
      window.cancelAnimationFrame(animationFrame)
      animationFrame = null
    }
    if (scrollSettleTimer !== null) window.clearTimeout(scrollSettleTimer)
    setVisible(false)
    scrollSettleTimer = window.setTimeout(() => {
      scrollSettleTimer = null
      scheduleUpdate()
    }, SCROLL_SETTLE_DELAY_MS)
  }
  const handleResize = () => scheduleUpdate()

  view.dom.addEventListener('focus', handleFocus)
  view.dom.addEventListener('blur', handleBlur)
  view.dom.addEventListener('compositionstart', handleComposition)
  view.dom.addEventListener('compositionend', handleComposition)
  scrollHost?.addEventListener('scroll', handleScroll, { passive: true })
  window.addEventListener('resize', handleResize)
  scheduleUpdate()

  return {
    update(nextView: EditorView, previousState?: EditorState) {
      view = nextView
      if (
        previousState &&
        view.state.doc === previousState.doc &&
        view.state.selection.eq(previousState.selection)
      ) {
        return
      }
      scheduleUpdate()
    },
    destroy() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = null
      }
      if (scrollSettleTimer !== null) {
        window.clearTimeout(scrollSettleTimer)
        scrollSettleTimer = null
      }
      view.dom.classList.remove('marklab-animated-cursor-host')
      view.dom.removeEventListener('focus', handleFocus)
      view.dom.removeEventListener('blur', handleBlur)
      view.dom.removeEventListener('compositionstart', handleComposition)
      view.dom.removeEventListener('compositionend', handleComposition)
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
