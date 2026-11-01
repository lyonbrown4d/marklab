import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Sigma, { Camera } from 'sigma'
import type { Coordinates, WheelCoords } from 'sigma/types'
import {
  bindGraphWheelController,
  normalizeGraphWheel,
} from '@/features/knowledge-graph/graphWheelController'

// Sigma eagerly reads GL enum values when importing its real Camera class.
// The controller does not create a GL context; browser acceptance covers rendering.
vi.hoisted(() => {
  vi.stubGlobal('WebGL2RenderingContext', {
    BOOL: 35670,
    BYTE: 5120,
    UNSIGNED_BYTE: 5121,
    SHORT: 5122,
    UNSIGNED_SHORT: 5123,
    INT: 5124,
    UNSIGNED_INT: 5125,
    FLOAT: 5126,
  })
})

let frames: Map<number, FrameRequestCallback>
let nextFrame: number
const flush = () => {
  const current = [...frames.values()]
  frames.clear()
  current.forEach((callback) => callback(16))
}

beforeEach(() => {
  frames = new Map()
  nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
})
afterEach(() => {
  document.body.replaceChildren()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const setup = () => {
  const container = document.createElement('div')
  document.body.append(container)
  const camera = new Camera()
  camera.minRatio = 0.05
  camera.maxRatio = 8
  const updated = vi.fn()
  camera.on('updated', updated)
  const listeners = new Map<string, (coordinates: WheelCoords) => void>()
  const project = ({ x, y }: Coordinates) => ({
    x: camera.x + (x / 100 - 0.5) * camera.ratio,
    y: camera.y - (y / 100 - 0.5) * camera.ratio,
  })
  // Exercise Sigma's actual cursor anchoring and Camera bounds. Only viewport
  // projection is a deterministic 100px square; no WebGL context is required.
  const zoomAt = vi.fn(
    (point: Coordinates, ratio: number) =>
      Reflect.apply(
        Sigma.prototype.getViewportZoomedState,
        {
          camera,
          width: 100,
          height: 100,
          internals: { settings: { minCameraRatio: 0.05, maxCameraRatio: 8 } },
          viewportToFramedGraph: project,
        },
        [point, ratio],
      ) as ReturnType<Camera['getState']>,
  )
  const renderer = {
    getCamera: () => camera,
    getMouseCaptor: () => ({
      on: (event: string, callback: (coordinates: WheelCoords) => void) =>
        listeners.set(event, callback),
      off: (event: string) => listeners.delete(event),
    }),
    viewportToFramedGraph: project,
    getViewportZoomedState: zoomAt,
  }
  const controller = bindGraphWheelController(renderer, container)
  const wheel = (init: WheelEventInit = {}, point = { x: 40, y: 30 }) => {
    const original = new WheelEvent('wheel', { cancelable: true, ...init })
    const preventSigmaDefault = vi.fn()
    listeners.get('wheel')?.({
      ...point,
      original,
      delta: 0,
      sigmaDefaultPrevented: false,
      preventSigmaDefault,
    })
    return { original, preventSigmaDefault }
  }
  return { container, camera, controller, listeners, wheel, zoomAt, updated }
}

describe('graph wheel input', () => {
  it('normalizes pixel, line and page deltas and clamps malformed or extreme input', () => {
    const input = {
      deltaX: 2.5,
      deltaY: 3,
      deltaMode: 0,
      ctrlKey: false,
      altKey: false,
      metaKey: false,
    }
    expect(normalizeGraphWheel(input, 800)).toEqual({ x: 2.5, y: 3, zoom: false })
    expect(normalizeGraphWheel({ ...input, deltaMode: 1 }, 800)).toEqual({
      x: 40,
      y: 48,
      zoom: true,
    })
    expect(normalizeGraphWheel({ ...input, deltaMode: 2 }, 800)).toEqual({
      x: 120,
      y: 120,
      zoom: true,
    })
    expect(normalizeGraphWheel({ ...input, deltaX: Infinity, deltaY: NaN }, 800)).toEqual({
      x: 0,
      y: 0,
      zoom: false,
    })
    expect(normalizeGraphWheel({ ...input, deltaY: -9000 }, 800).y).toBe(-160)
    expect(normalizeGraphWheel({ ...input, deltaMode: 2, deltaY: 0.5 }, 0).y).toBe(0.5)
  })

  it('coalesces smooth diagonal panning once per frame and consumes browser and Sigma defaults', () => {
    const { wheel, camera, controller, updated, zoomAt } = setup()
    const event = wheel({ deltaX: 8, deltaY: -4 })
    wheel({ deltaX: 2, deltaY: -6 })
    expect(event.original.defaultPrevented).toBe(true)
    expect(event.preventSigmaDefault).toHaveBeenCalledOnce()
    expect(updated).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    flush()
    expect(camera.x).toBeCloseTo(0.6)
    expect(camera.y).toBeCloseTo(0.6)
    expect(camera.getState()).toMatchObject({ ratio: 1, angle: 0 })
    expect(updated).toHaveBeenCalledOnce()
    expect(zoomAt).not.toHaveBeenCalled()
    // Native momentum is applied directly, with no second synthetic animation.
    wheel({ deltaY: 1.25 })
    flush()
    expect(camera.y).toBeCloseTo(0.5875)
    expect(frames.size).toBe(0)
    controller.destroy()
  })

  it('anchors pinch zoom to the latest pointer and bounds accumulated input and camera ratios', () => {
    const { wheel, camera, zoomAt, controller } = setup()
    wheel({ deltaY: -10, ctrlKey: true }, { x: 20, y: 20 })
    wheel({ deltaY: -10, ctrlKey: true }, { x: 80, y: 40 })
    flush()
    expect(zoomAt).toHaveBeenLastCalledWith({ x: 80, y: 40 }, Math.exp(-0.2))
    expect(camera.x + 0.3 * camera.ratio).toBeCloseTo(0.8)
    expect(camera.y + 0.1 * camera.ratio).toBeCloseTo(0.6)
    expect(camera.angle).toBe(0)
    for (let index = 0; index < 100; index++) wheel({ deltaY: 99999, ctrlKey: true })
    const previousRatio = camera.ratio
    flush()
    expect(camera.ratio).toBeCloseTo(previousRatio * Math.exp(0.4))
    camera.setState({ ratio: 8 })
    wheel({ deltaY: 120, ctrlKey: true })
    flush()
    expect(camera.ratio).toBe(8)
    camera.setState({ ratio: 0.05 })
    wheel({ deltaY: -120, ctrlKey: true })
    flush()
    expect(camera.ratio).toBe(0.05)
    controller.destroy()
  })

  it('zooms line/page mouse wheels and modifier pixel wheels without guessing device identity', () => {
    const { wheel, camera, controller } = setup()
    for (const init of [{ deltaMode: 1 }, { deltaMode: 2 }, { altKey: true }, { metaKey: true }]) {
      camera.setState({ ratio: 1 })
      wheel({ deltaY: 2, ...init })
      flush()
      expect(camera.ratio).toBeGreaterThan(1)
    }
    camera.setState({ ratio: 1 })
    wheel({ deltaY: 100 })
    flush()
    expect(camera.ratio).toBe(1)
    controller.destroy()
  })

  it('cancels queued movement on hide, explicit cancellation, detached surfaces and destruction', () => {
    const { wheel, camera, controller, listeners, container, updated } = setup()
    wheel({ deltaY: 20 })
    controller.cancel()
    flush()
    expect(updated).not.toHaveBeenCalled()
    wheel({ deltaY: 20 })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    const hiddenWheel = wheel({ deltaY: 20, ctrlKey: true })
    expect(hiddenWheel.original.defaultPrevented).toBe(true)
    expect(frames.size).toBe(0)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    wheel({ deltaY: 20 })
    container.remove()
    flush()
    expect(updated).not.toHaveBeenCalled()
    document.body.append(container)
    const zero = wheel()
    expect(zero.original.defaultPrevented).toBe(true)
    expect(frames.size).toBe(0)
    wheel({ deltaY: 20 })
    controller.destroy()
    controller.destroy()
    flush()
    expect(camera.getState()).toMatchObject({ x: 0.5, y: 0.5, ratio: 1 })
    expect(listeners.size).toBe(0)
    expect(frames.size).toBe(0)
  })
})
