import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  setToastHeight: vi.fn(),
  toasterMounted: true,
  toastTops: [620] as number[],
}))

vi.mock('@/app/nativeSurfaceInsets', () => ({
  useNativeSurfaceInsetsStore: (selector: (state: unknown) => unknown) =>
    selector({ setToastHeight: mocks.setToastHeight }),
}))
vi.mock('@/components/ui/sonner', () => ({
  Toaster: () =>
    mocks.toasterMounted ? (
      <ol data-sonner-toaster>
        {mocks.toastTops.map((top, index) => (
          <li key={`${top}-${index}`} data-sonner-toast data-toast-top={top} />
        ))}
      </ol>
    ) : null,
}))

import AppToaster from '@/app/AppToaster'

type MutationObserverHarness = {
  callback: MutationCallback
  disconnect: ReturnType<typeof vi.fn>
  observe: ReturnType<typeof vi.fn>
}

let mutationObservers: MutationObserverHarness[]

const getBodyObserver = () =>
  mutationObservers.find(({ observe }) =>
    observe.mock.calls.some(([target]) => target === document.body),
  )

const getToasterObserver = () =>
  mutationObservers.find(({ observe }) =>
    observe.mock.calls.some(
      ([target]) => target instanceof Element && target.matches('[data-sonner-toaster]'),
    ),
  )

describe('AppToaster', () => {
  beforeEach(() => {
    mocks.setToastHeight.mockClear()
    mocks.toasterMounted = true
    mocks.toastTops = [620]
    mutationObservers = []
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 })
    vi.stubGlobal(
      'MutationObserver',
      class MutationObserverMock {
        disconnect = vi.fn()
        observe = vi.fn()
        takeRecords = vi.fn(() => [])
        constructor(callback: MutationCallback) {
          mutationObservers.push({
            callback,
            disconnect: this.disconnect,
            observe: this.observe,
          })
        }
      },
    )
    vi.stubGlobal(
      'ResizeObserver',
      class ResizeObserverMock {
        disconnect = vi.fn()
        observe = vi.fn()
        unobserve = vi.fn()
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const top = Number(this.dataset.toastTop ?? 0)
      const height = this.hasAttribute('data-sonner-toast') ? 60 : 0
      return {
        bottom: top + height,
        height,
        left: 100,
        right: 500,
        top,
        width: height > 0 ? 400 : 0,
        x: 100,
        y: top,
        toJSON: () => ({}),
      }
    })
  })

  it('measures the visible toast union including its viewport offset', () => {
    render(<AppToaster />)

    expect(mocks.setToastHeight).toHaveBeenLastCalledWith(100)
  })

  it('observes document body child changes without tracking editor attributes', () => {
    render(<AppToaster />)

    expect(mutationObservers).toHaveLength(2)
    expect(getBodyObserver()?.observe).toHaveBeenCalledWith(document.body, {
      childList: true,
      subtree: true,
    })
    const bodyOptions = getBodyObserver()?.observe.mock.calls[0]?.[1]
    expect(bodyOptions).not.toHaveProperty('attributes')
  })

  it('tracks toasts that appear, expand, and disappear after mount', () => {
    const view = render(<AppToaster />)
    mocks.toastTops = [620, 540]
    view.rerender(<AppToaster />)
    act(() => getToasterObserver()?.callback([], {} as MutationObserver))
    expect(mocks.setToastHeight).toHaveBeenLastCalledWith(180)

    mocks.toastTops = []
    view.rerender(<AppToaster />)
    act(() => getToasterObserver()?.callback([], {} as MutationObserver))
    expect(mocks.setToastHeight).toHaveBeenLastCalledWith(0)
  })

  it('unbinds a removed toaster and rebinds a later replacement', () => {
    const view = render(<AppToaster />)
    const removedToaster = document.querySelector('[data-sonner-toaster]')
    mocks.toasterMounted = false
    view.rerender(<AppToaster />)
    act(() =>
      getBodyObserver()?.callback(
        [{ addedNodes: [], removedNodes: [removedToaster] } as unknown as MutationRecord],
        {} as MutationObserver,
      ),
    )
    expect(mocks.setToastHeight).toHaveBeenLastCalledWith(0)

    mocks.toasterMounted = true
    mocks.toastTops = [500]
    view.rerender(<AppToaster />)
    const addedToaster = document.querySelector('[data-sonner-toaster]')
    act(() =>
      getBodyObserver()?.callback(
        [{ addedNodes: [addedToaster], removedNodes: [] } as unknown as MutationRecord],
        {} as MutationObserver,
      ),
    )
    expect(mocks.setToastHeight).toHaveBeenLastCalledWith(220)
  })
})
