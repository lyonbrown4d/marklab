import type { Camera } from 'sigma'
import type { Coordinates, WheelCoords } from 'sigma/types'

type WheelRenderer = {
  getCamera: () => Pick<Camera, 'getState' | 'getBoundedRatio' | 'setState' | 'cancelAnimation'>
  getMouseCaptor: () => {
    on: (event: 'wheel', listener: (event: WheelCoords) => void) => unknown
    off: (event: 'wheel', listener: (event: WheelCoords) => void) => unknown
  }
  viewportToFramedGraph: (point: Coordinates) => Coordinates
  getViewportZoomedState: (point: Coordinates, ratio: number) => ReturnType<Camera['getState']>
}

export const normalizeGraphWheel = (
  event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'ctrlKey' | 'altKey' | 'metaKey'>,
  pageHeight: number,
) => {
  // Pixel wheel events do not identify the device. Keep smooth scrolling predictable;
  // a modifier also gives pixel-mode mouse wheels an explicit zoom gesture.
  const zoom = event.ctrlKey || event.altKey || event.metaKey || event.deltaMode !== 0
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? Math.max(1, pageHeight) : 1
  const limit = zoom ? 120 : 160
  const normalize = (value: number) =>
    Number.isFinite(value) ? Math.max(-limit, Math.min(limit, value * unit)) : 0
  return { zoom, x: normalize(event.deltaX), y: normalize(event.deltaY) }
}

/** Replace only Sigma's wheel gesture; its picking, pointer and touch captors stay intact. */
export const bindGraphWheelController = (renderer: WheelRenderer, container: HTMLElement) => {
  const camera = renderer.getCamera()
  const captor = renderer.getMouseCaptor()
  let frame: number | null = null
  let pending = { x: 0, y: 0, zoom: 0 }
  let anchor: Coordinates = { x: 0, y: 0 }
  let destroyed = false
  const cancel = () => {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    pending = { x: 0, y: 0, zoom: 0 }
  }
  const apply = () => {
    frame = null
    const movement = pending
    pending = { x: 0, y: 0, zoom: 0 }
    if (destroyed || document.visibilityState === 'hidden' || !container.isConnected) return
    camera.cancelAnimation()
    if (movement.x || movement.y) {
      const origin = renderer.viewportToFramedGraph({ x: 0, y: 0 })
      const target = renderer.viewportToFramedGraph({ x: movement.x, y: movement.y })
      const state = camera.getState()
      camera.setState({ x: state.x + target.x - origin.x, y: state.y + target.y - origin.y })
    }
    if (movement.zoom) {
      const ratio = camera.getBoundedRatio(camera.getState().ratio * Math.exp(movement.zoom))
      camera.setState(renderer.getViewportZoomedState(anchor, ratio))
    }
  }
  const wheel = (coordinates: WheelCoords) => {
    coordinates.preventSigmaDefault()
    const event = coordinates.original as WheelEvent
    // Consume even zero/limit wheel events, preventing page zoom and history swipes.
    event.preventDefault()
    event.stopPropagation()
    if (destroyed || document.visibilityState === 'hidden') return
    const movement = normalizeGraphWheel(event, container.clientHeight)
    if (!movement.x && !movement.y) return
    if (movement.zoom) {
      anchor = { x: coordinates.x, y: coordinates.y }
      const sensitivity = event.ctrlKey ? 0.01 : 0.002
      pending.zoom = Math.max(-0.4, Math.min(0.4, pending.zoom + movement.y * sensitivity))
    } else {
      pending.x = Math.max(-160, Math.min(160, pending.x + movement.x))
      pending.y = Math.max(-160, Math.min(160, pending.y + movement.y))
    }
    if (frame === null) frame = requestAnimationFrame(apply)
  }
  const visibilityChanged = () => {
    if (document.visibilityState === 'hidden') cancel()
  }
  captor.on('wheel', wheel)
  document.addEventListener('visibilitychange', visibilityChanged)
  // No animations or synthetic inertia: native touchpad momentum is already in the events.
  return {
    cancel,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      cancel()
      captor.off('wheel', wheel)
      document.removeEventListener('visibilitychange', visibilityChanged)
    },
  }
}
