export const ANIMATED_CURSOR_VIEWPORT_EVENT = 'marklab:animated-cursor-viewport'

export const notifyAnimatedCursorViewport = (viewport: HTMLElement | null): void => {
  const EventConstructor = viewport?.ownerDocument.defaultView?.Event
  if (!viewport || !EventConstructor) return
  viewport.dispatchEvent(new EventConstructor(ANIMATED_CURSOR_VIEWPORT_EVENT))
}
