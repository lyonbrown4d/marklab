import { act, renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlateDocumentNavigation } from '@/components/plate/usePlateDocumentNavigation'
import { activeHeadingStore, clearDocumentNavigation } from '@/utils/editorNavigation'

describe('usePlateDocumentNavigation', () => {
  let animationFrames: FrameRequestCallback[]
  let resizeCallback: ResizeObserverCallback
  const mutationObserverConstructor = vi.fn()
  const disconnectResize = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['clearTimeout', 'setTimeout'] })
    animationFrames = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrames.push(callback)
      return animationFrames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    mutationObserverConstructor.mockClear()
    disconnectResize.mockClear()
    vi.stubGlobal(
      'MutationObserver',
      class MutationObserverMock {
        constructor() {
          mutationObserverConstructor()
        }
        disconnect = vi.fn()
        observe = vi.fn()
      },
    )
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverMock {
        constructor(callback: ResizeObserverCallback) {
          resizeCallback = callback
        }
        disconnect = disconnectResize
        observe = vi.fn()
      },
    )
  })

  afterEach(() => {
    clearDocumentNavigation('guide.md')
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const flushAnimationFrame = () => {
    const callbacks = animationFrames.splice(0)
    callbacks.forEach((callback) => callback(performance.now()))
  }

  it('publishes rounded scroll progress and clears it when the document deactivates', () => {
    const element = document.createElement('div')
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 400, writable: true },
    })
    const editableRef = createRef<HTMLDivElement>()
    editableRef.current = element
    const { rerender, unmount } = renderHook(
      ({ enabled }) => usePlateDocumentNavigation('guide.md', editableRef, enabled),
      { initialProps: { enabled: true } },
    )

    act(flushAnimationFrame)
    expect(activeHeadingStore.getState().scrollProgress['guide.md']).toBe(50)

    rerender({ enabled: false })
    expect(activeHeadingStore.getState().scrollProgress['guide.md']).toBeUndefined()
    unmount()
  })

  it('merges repeated document edits into one delayed layout measurement', () => {
    let scrollHeight = 1_000
    const element = document.createElement('div')
    Object.defineProperties(element, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, get: () => scrollHeight },
      scrollTop: { configurable: true, value: 400, writable: true },
    })
    const editableRef = createRef<HTMLDivElement>()
    editableRef.current = element
    const { result } = renderHook(() => usePlateDocumentNavigation('guide.md', editableRef, true))
    act(flushAnimationFrame)
    expect(activeHeadingStore.getState().scrollProgress['guide.md']).toBe(50)

    scrollHeight = 1_800
    act(() => {
      result.current()
      result.current()
      result.current()
    })
    expect(animationFrames).toHaveLength(0)

    act(() => vi.runOnlyPendingTimers())
    expect(animationFrames).toHaveLength(1)
    act(flushAnimationFrame)

    expect(activeHeadingStore.getState().scrollProgress['guide.md']).toBe(25)
    expect(mutationObserverConstructor).not.toHaveBeenCalled()
  })

  it('recalculates viewport resizes without scheduling duplicate frames', () => {
    const element = document.createElement('div')
    const editableRef = createRef<HTMLDivElement>()
    editableRef.current = element
    renderHook(() => usePlateDocumentNavigation('guide.md', editableRef, true))
    act(flushAnimationFrame)

    act(() => {
      resizeCallback([], {} as ResizeObserver)
      resizeCallback([], {} as ResizeObserver)
    })

    expect(animationFrames).toHaveLength(1)
  })

  it('disconnects observers and cancels pending work on cleanup', () => {
    const element = document.createElement('div')
    const editableRef = createRef<HTMLDivElement>()
    editableRef.current = element
    const { result, unmount } = renderHook(() =>
      usePlateDocumentNavigation('guide.md', editableRef, true),
    )
    act(flushAnimationFrame)
    act(() => {
      result.current()
      element.dispatchEvent(new Event('scroll'))
    })

    unmount()

    expect(disconnectResize).toHaveBeenCalledOnce()
    expect(window.cancelAnimationFrame).toHaveBeenCalledOnce()
    act(() => vi.runOnlyPendingTimers())
    expect(animationFrames).toHaveLength(1)
  })
})
