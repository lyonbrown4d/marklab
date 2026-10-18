import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventHub } from '@/runtime/tauri/transport'
import { createWindowApis } from '@/runtime/tauri/window'

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  closeRequested: null as null | ((event: { preventDefault: () => void }) => void),
  dragDrop: null as
    | null
    | ((event: {
        payload: {
          type: string
          paths: string[]
          position: { x: number; y: number }
        }
      }) => void),
  window: {
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    isMaximized: vi.fn(),
    startDragging: vi.fn(),
    isVisible: vi.fn(),
    onCloseRequested: vi.fn(),
    scaleFactor: vi.fn(),
    onScaleChanged: vi.fn(),
  },
  webview: { onDragDropEvent: vi.fn() },
}))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }))
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => native.window }))
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => native.webview }))

beforeEach(() => {
  vi.clearAllMocks()
  native.invoke.mockResolvedValue(undefined)
  native.window.isVisible.mockResolvedValue(false)
  native.window.scaleFactor.mockResolvedValue(2)
  native.window.onScaleChanged.mockResolvedValue(vi.fn())
  native.window.onCloseRequested.mockImplementation(async (handler) => {
    native.closeRequested = handler
    return vi.fn()
  })
  native.webview.onDragDropEvent.mockImplementation(async (handler) => {
    native.dragDrop = handler
    return vi.fn()
  })
})

describe('Tauri window lifecycle', () => {
  it('reports dirty flush failures through the native save-failed dialog', async () => {
    const api = createWindowApis(createEventHub())
    await api.install()
    api.window.onCloseRequested(() => Promise.reject(new Error('Disk conflict')))
    native.closeRequested?.({ preventDefault: vi.fn() })
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledWith('window_report_close_error', {
        request: { message: 'Disk conflict' },
      }),
    )
    expect(native.invoke).not.toHaveBeenCalledWith('window_close_commit', expect.anything())
    api.dispose()
  })

  it('waits for dirty editor flushes and coalesces repeated close requests', async () => {
    const api = createWindowApis(createEventHub())
    await api.install()
    let completeFlush: () => void = () => undefined
    let markStarted: () => void = () => undefined
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    api.window.onCloseRequested(() => {
      markStarted()
      return new Promise<void>((resolve) => {
        completeFlush = resolve
      })
    })
    const first = api.window.close()
    const second = api.window.close()
    expect(second).toBe(first)
    await started
    expect(native.invoke).not.toHaveBeenCalled()
    completeFlush()
    await first
    expect(native.invoke).toHaveBeenCalledWith('window_close_commit', { request: {} })
  })

  it('acknowledges native application flush requests without destroying any window', async () => {
    const events = createEventHub()
    const api = createWindowApis(events)
    const failure = new Error('Editor flush failed')
    api.window.onCloseRequested(() => {
      throw failure
    })
    let finishAck: () => void = () => undefined
    const acknowledged = new Promise<void>((resolve) => {
      finishAck = resolve
    })
    native.invoke.mockImplementation(async () => {
      finishAck()
    })
    events.publish('window-flush-requested', { requestId: 'quit-1' })
    await acknowledged
    expect(native.invoke.mock.calls).toEqual([
      [
        'window_flush_result',
        {
          request: { requestId: 'quit-1', error: 'Editor flush failed' },
        },
      ],
    ])
    api.dispose()
  })

  it('leaves the window open on flush failure and permits retry', async () => {
    const api = createWindowApis(createEventHub())
    const flush = vi
      .fn()
      .mockRejectedValueOnce(new Error('Disk full'))
      .mockResolvedValueOnce(undefined)
    api.window.onCloseRequested(flush)
    await expect(api.window.close()).rejects.toThrow('Disk full')
    expect(native.invoke).not.toHaveBeenCalled()
    await api.window.close()
    expect(native.invoke).toHaveBeenCalledOnce()
  })

  it('prevents native destruction and forwards OS file drops through the typed surface', async () => {
    const events = createEventHub()
    const api = createWindowApis(events)
    native.window.isVisible.mockResolvedValue(true)
    await api.install()
    const presented = vi.fn()
    api.window.onPresented(presented)
    expect(presented).toHaveBeenCalledOnce()
    const preventDefault = vi.fn()
    native.closeRequested?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    const onDrop = vi.fn()
    const stop = api.webview.onFileDrop(onDrop)
    native.dragDrop?.({ payload: { type: 'drop', paths: ['/notes.md'], position: { x: 5, y: 8 } } })
    expect(onDrop).toHaveBeenCalledWith({ paths: ['/notes.md'], position: { x: 2.5, y: 4 } })
    stop()
    native.dragDrop?.({ payload: { type: 'drop', paths: ['/other.md'], position: { x: 0, y: 0 } } })
    expect(onDrop).toHaveBeenCalledOnce()
    await api.window.close()
    api.dispose()
  })
})
