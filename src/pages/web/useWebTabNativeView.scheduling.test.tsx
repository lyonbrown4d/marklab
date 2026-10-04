import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

const webTabs = vi.hoisted(() => ({
  activate: vi.fn().mockResolvedValue({ ok: true }),
  hide: vi.fn().mockResolvedValue({ ok: true }),
  onState: vi.fn(() => vi.fn()),
  setBounds: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => ({ webTabs }),
}))
vi.mock('@/store/useWorkspaceStore', () => ({
  useWorkspaceStore: { getState: () => ({ setTabs: vi.fn(), tabs: [] }) },
}))

import { useWebTabNativeView } from '@/pages/web/useWebTabNativeView'

type ObserverHarness<T> = {
  callback: T
  disconnect: Mock<() => void>
}

let mutationObservers: ObserverHarness<MutationCallback>[]
let resizeObservers: ObserverHarness<ResizeObserverCallback>[]
let frames: Map<number, FrameRequestCallback>
let nextFrameId: number

class ResizeObserverMock {
  readonly harness: ObserverHarness<ResizeObserverCallback>
  constructor(callback: ResizeObserverCallback) {
    this.harness = { callback, disconnect: vi.fn() }
    resizeObservers.push(this.harness)
  }
  disconnect = () => this.harness.disconnect()
  observe = vi.fn()
  unobserve = vi.fn()
}

class MutationObserverMock {
  readonly harness: ObserverHarness<MutationCallback>
  constructor(callback: MutationCallback) {
    this.harness = { callback, disconnect: vi.fn() }
    mutationObservers.push(this.harness)
  }
  disconnect = () => this.harness.disconnect()
  observe = vi.fn()
  takeRecords = vi.fn(() => [])
}

const flushFrames = () => {
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach((callback) => callback(0))
}

const Harness = () => {
  const { hostRef } = useWebTabNativeView({
    onOpenRequested: vi.fn(),
    suspended: false,
    tab: { kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' },
  })
  return <div ref={hostRef} />
}

beforeEach(() => {
  vi.clearAllMocks()
  frames = new Map()
  nextFrameId = 1
  mutationObservers = []
  resizeObservers = []
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('MutationObserver', MutationObserverMock)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = nextFrameId++
    frames.set(id, callback)
    return id
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id))
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 640,
    height: 600,
    left: 20,
    right: 820,
    top: 40,
    width: 800,
    x: 20,
    y: 40,
    toJSON: () => ({}),
  })
})

describe('useWebTabNativeView bounds scheduling', () => {
  it('coalesces resize, transform, and scroll signals into one measurement per frame', async () => {
    render(<Harness />)
    act(flushFrames)
    await waitFor(() => expect(webTabs.activate).toHaveBeenCalled())
    vi.mocked(window.requestAnimationFrame).mockClear()
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockClear()
    webTabs.setBounds.mockClear()
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValue({
      bottom: 510,
      height: 420,
      left: 135,
      right: 775,
      top: 90,
      width: 640,
      x: 135,
      y: 90,
      toJSON: () => ({}),
    })

    act(() => {
      resizeObservers.at(-1)?.callback([], {} as ResizeObserver)
      mutationObservers.at(-1)?.callback([], {} as MutationObserver)
      window.dispatchEvent(new Event('scroll'))
    })

    expect(window.requestAnimationFrame).toHaveBeenCalledOnce()
    act(flushFrames)
    expect(HTMLElement.prototype.getBoundingClientRect).toHaveBeenCalledOnce()
    expect(webTabs.setBounds).toHaveBeenCalledOnce()
  })

  it('cancels pending work and removes every bounds source on unmount', async () => {
    const view = render(<Harness />)
    act(flushFrames)
    await waitFor(() => expect(webTabs.activate).toHaveBeenCalled())
    const resizeObserver = resizeObservers.at(-1)
    const mutationObserver = mutationObservers.at(-1)
    act(() => resizeObserver?.callback([], {} as ResizeObserver))
    expect(frames.size).toBe(1)

    view.unmount()

    expect(frames.size).toBe(0)
    expect(resizeObserver?.disconnect).toHaveBeenCalledOnce()
    expect(mutationObserver?.disconnect).toHaveBeenCalledOnce()
    vi.mocked(window.requestAnimationFrame).mockClear()
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new Event('scroll'))
    expect(window.requestAnimationFrame).not.toHaveBeenCalled()
  })
})
