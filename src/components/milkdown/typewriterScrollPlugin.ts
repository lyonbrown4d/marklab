import { Plugin, type EditorState } from '@milkdown/kit/prose/state'
import type { EditorView } from '@milkdown/kit/prose/view'
import { $prose } from '@milkdown/kit/utils'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const TARGET_VIEWPORT_RATIO = 0.44
const DEAD_ZONE_PX = 18

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const prefersReducedMotion = () => {
  if (typeof window === 'undefined') return true
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

const isTypewriterEnabled = () => {
  if (typeof document === 'undefined') return false
  return document.documentElement.dataset.immersiveTypewriter === 'true'
}

const isSmoothScrollEnabled = () => {
  if (typeof document === 'undefined') return false
  return (
    document.documentElement.dataset.motionSmoothScrolling === 'true' && !prefersReducedMotion()
  )
}

const getEditorViewport = (view: EditorView) => {
  return view.dom.closest('.crepe')?.querySelector<HTMLElement>('.editor-scroll-viewport') ?? null
}

const createTypewriterScrollView = (initialView: EditorView) => {
  let view = initialView
  let animationFrame: number | null = null
  let lastHead = view.state.selection.head

  const scrollToSelection = () => {
    animationFrame = null
    if (!isTypewriterEnabled() || !view.hasFocus() || !view.state.selection.empty) return

    const viewport = getEditorViewport(view)
    if (!viewport) return

    try {
      const caretRect = view.coordsAtPos(view.state.selection.head)
      const viewportRect = viewport.getBoundingClientRect()
      const targetTop = viewportRect.top + viewportRect.height * TARGET_VIEWPORT_RATIO
      const delta = caretRect.top - targetTop
      if (Math.abs(delta) < DEAD_ZONE_PX) return

      const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
      const nextTop = clamp(viewport.scrollTop + delta, 0, maxScrollTop)
      viewport.scrollTo({
        top: nextTop,
        behavior: isSmoothScrollEnabled() ? 'smooth' : 'auto',
      })
    } catch {
      // Ignore transient ProseMirror coordinate failures while nodes remount.
    }
  }

  const scheduleScroll = () => {
    if (animationFrame !== null) return
    animationFrame = window.requestAnimationFrame(scrollToSelection)
  }

  return {
    update(nextView: EditorView, previousState?: EditorState) {
      view = nextView
      const nextHead = view.state.selection.head
      const docChanged = previousState ? !view.state.doc.eq(previousState.doc) : false
      if (nextHead === lastHead && !docChanged) return
      lastHead = nextHead
      scheduleScroll()
    },
    destroy() {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame)
        animationFrame = null
      }
    },
  }
}

export const typewriterScroll = $prose(() => {
  return new Plugin({
    view: createTypewriterScrollView,
  })
})
