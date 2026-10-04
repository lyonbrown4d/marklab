import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebTabEvent } from '@/types/webTabs'

const webTabs = vi.hoisted(() => ({
  activate: vi.fn().mockResolvedValue({ ok: true }),
  close: vi.fn().mockResolvedValue({ ok: true }),
  goBack: vi.fn(),
  goForward: vi.fn(),
  hide: vi.fn().mockResolvedValue({ ok: true }),
  navigate: vi.fn(),
  onState: vi.fn(),
  reload: vi.fn(),
  setBounds: vi.fn().mockResolvedValue({ ok: true }),
  stop: vi.fn(),
}))
const workspace = vi.hoisted(() => ({
  setTabs: vi.fn(),
  tabs: [{ kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' }],
}))

vi.mock('@/runtime/electron', () => ({
  getElectronRuntime: () => ({ webTabs }),
  isElectronRuntime: () => false,
}))
vi.mock('@/store/useWorkspaceStore', () => ({
  useWorkspaceStore: { getState: () => workspace },
}))

import { useWebTabNativeView } from '@/pages/web/useWebTabNativeView'

let resize: ResizeObserverCallback
let mutations: MutationCallback[]
let stateHandler: ((event: WebTabEvent) => void) | undefined

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resize = callback
  }
  disconnect = vi.fn()
  observe = vi.fn()
  unobserve = vi.fn()
}

class MutationObserverMock {
  constructor(callback: MutationCallback) {
    mutations.push(callback)
  }
  disconnect = vi.fn()
  observe = vi.fn()
  takeRecords = vi.fn(() => [])
}

const Harness = ({
  onOpenRequested = vi.fn(),
  suspended = false,
}: {
  onOpenRequested?: (url: string) => void
  suspended?: boolean
}) => {
  const { hostRef, state } = useWebTabNativeView({
    onOpenRequested,
    suspended,
    tab: { kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' },
  })
  return (
    <div>
      <div ref={hostRef} data-testid="host" />
      <output>{state.status}</output>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  workspace.tabs = [{ kind: 'web', id: 'web-id', title: 'Docs', url: 'https://example.com/docs' }]
  stateHandler = undefined
  mutations = []
  webTabs.onState.mockImplementation((handler: (event: WebTabEvent) => void) => {
    stateHandler = handler
    return vi.fn()
  })
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
  vi.stubGlobal('MutationObserver', MutationObserverMock)
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
    window.setTimeout(() => callback(0), 0),
  )
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => window.clearTimeout(id))
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

describe('useWebTabNativeView', () => {
  it('activates with measured bounds and avoids duplicate bounds writes', async () => {
    render(<Harness />)

    await waitFor(() =>
      expect(webTabs.activate).toHaveBeenCalledWith({
        bounds: { height: 600, width: 800, x: 20, y: 40 },
        tabId: 'web-id',
        url: 'https://example.com/docs',
      }),
    )
    act(() => resize([], {} as ResizeObserver))
    expect(webTabs.setBounds).not.toHaveBeenCalled()
  })

  it('synchronizes bounds when an ancestor transform moves the native host', async () => {
    render(<Harness />)
    await waitFor(() => expect(webTabs.activate).toHaveBeenCalled())
    expect(mutations.length).toBeGreaterThan(0)
    webTabs.setBounds.mockClear()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 690,
      height: 600,
      left: 135,
      right: 935,
      top: 90,
      width: 800,
      x: 135,
      y: 90,
      toJSON: () => ({}),
    })

    act(() => mutations.forEach((callback) => callback([], {} as MutationObserver)))

    await waitFor(() =>
      expect(webTabs.setBounds).toHaveBeenCalledWith({
        bounds: { height: 600, width: 800, x: 135, y: 90 },
        tabId: 'web-id',
      }),
    )
  })

  it('synchronizes bounds when a node resizer changes the native host size', async () => {
    render(<Harness />)
    await waitFor(() => expect(webTabs.activate).toHaveBeenCalled())
    webTabs.setBounds.mockClear()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 460,
      height: 420,
      left: 20,
      right: 660,
      top: 40,
      width: 640,
      x: 20,
      y: 40,
      toJSON: () => ({}),
    })

    act(() => resize([], {} as ResizeObserver))

    await waitFor(() =>
      expect(webTabs.setBounds).toHaveBeenCalledWith({
        bounds: { height: 420, width: 640, x: 20, y: 40 },
        tabId: 'web-id',
      }),
    )
  })

  it('hides a previously active view when the host collapses to zero size', async () => {
    render(<Harness />)
    await waitFor(() => expect(webTabs.activate).toHaveBeenCalled())
    webTabs.hide.mockClear()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 40,
      height: 0,
      left: 20,
      right: 20,
      top: 40,
      width: 0,
      x: 20,
      y: 40,
      toJSON: () => ({}),
    })

    act(() => resize([], {} as ResizeObserver))

    await waitFor(() => expect(webTabs.hide).toHaveBeenCalledWith({ tabId: 'web-id' }))
  })

  it('reflects native loading states and hides while suspended', async () => {
    const view = render(<Harness />)
    await waitFor(() => expect(webTabs.activate).toHaveBeenCalled())

    act(() => {
      stateHandler?.({
        type: 'state',
        state: {
          active: true,
          canGoBack: true,
          canGoForward: false,
          status: 'ready',
          tabId: 'web-id',
          title: 'Updated docs',
          url: 'https://example.com/updated',
        },
      })
    })
    expect(screen.getByText('ready')).toBeVisible()

    view.rerender(<Harness suspended />)
    await waitFor(() => expect(webTabs.hide).toHaveBeenCalledWith({ tabId: 'web-id' }))
  })

  it('does not hide when focus moves into the native view and hides on unmount', async () => {
    const view = render(<Harness />)
    await waitFor(() => expect(webTabs.activate).toHaveBeenCalled())

    webTabs.hide.mockClear()
    act(() => window.dispatchEvent(new Event('blur')))
    expect(webTabs.hide).not.toHaveBeenCalled()
    view.unmount()

    expect(webTabs.close).not.toHaveBeenCalled()
    expect(webTabs.hide).toHaveBeenCalledWith({ tabId: 'web-id' })
  })

  it('forwards a safe native popup request to a new app tab', async () => {
    const onOpenRequested = vi.fn()
    render(<Harness onOpenRequested={onOpenRequested} />)
    await waitFor(() => expect(stateHandler).toBeTypeOf('function'))

    act(() => {
      stateHandler?.({
        type: 'open-requested',
        tabId: 'web-id',
        url: 'https://example.com/popup',
      })
    })

    expect(onOpenRequested).toHaveBeenCalledWith('https://example.com/popup')
  })

  it('does not write unchanged high-frequency state into the workspace store', async () => {
    render(<Harness />)
    await waitFor(() => expect(stateHandler).toBeTypeOf('function'))
    const unchanged = {
      active: true,
      canGoBack: false,
      canGoForward: false,
      status: 'ready' as const,
      tabId: 'web-id',
      title: 'Docs',
      url: 'https://example.com/docs',
    }

    act(() => {
      stateHandler?.({ type: 'state', state: unchanged })
      stateHandler?.({ type: 'state', state: unchanged })
    })

    expect(workspace.setTabs).not.toHaveBeenCalled()
  })
})
