import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventHub } from '@/runtime/tauri/transport'
import { createWindowApis, isTauriWindowVisible } from '@/runtime/tauri/window'

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  stopScale: vi.fn(),
  stopClose: vi.fn(),
  stopDrop: vi.fn(),
  scaleChanged: undefined as undefined | ((event: { payload: { scaleFactor: number } }) => void),
  closeRequested: undefined as undefined | ((event: { preventDefault: () => void }) => void),
  drop: undefined as
    | undefined
    | ((event: {
        payload: { type: string; paths: string[]; position: { x: number; y: number } }
      }) => void),
  window: {
    label: 'root',
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
  native.invoke.mockReset().mockResolvedValue(undefined)
  native.window.isVisible.mockResolvedValue(true)
  native.window.scaleFactor.mockResolvedValue(2)
  native.window.onScaleChanged.mockImplementation(async (handler) => {
    native.scaleChanged = handler
    return native.stopScale
  })
  native.window.onCloseRequested.mockImplementation(async (handler) => {
    native.closeRequested = handler
    return native.stopClose
  })
  native.webview.onDragDropEvent.mockImplementation(async (handler) => {
    native.drop = handler
    return native.stopDrop
  })
})
afterEach(() => vi.restoreAllMocks())

describe('native window recovery and ownership', () => {
  it('releases earlier subscriptions when drag-drop installation is rejected', async () => {
    native.webview.onDragDropEvent.mockRejectedValueOnce(new Error('Drop permission denied'))
    const api = createWindowApis(createEventHub())
    await expect(api.install()).rejects.toThrow('Drop permission denied')
    expect(native.stopScale).toHaveBeenCalledOnce()
    expect(native.stopClose).toHaveBeenCalledOnce()
    api.dispose()
    expect(native.stopScale).toHaveBeenCalledOnce()
    expect(native.stopClose).toHaveBeenCalledOnce()
  })

  it('uses the latest scale, ignores non-drop notifications, and releases native listeners', async () => {
    const events = createEventHub()
    events.publish('window-presented', null)
    const api = createWindowApis(events)
    await api.install()
    expect(native.window.isVisible).not.toHaveBeenCalled()
    const receive = vi.fn()
    api.webview.onFileDrop(receive)
    native.drop?.({ payload: { type: 'enter', paths: ['/ignored'], position: { x: 5, y: 10 } } })
    expect(receive).not.toHaveBeenCalled()
    native.scaleChanged?.({ payload: { scaleFactor: 5 } })
    native.drop?.({ payload: { type: 'drop', paths: ['/own.md'], position: { x: 5, y: 10 } } })
    expect(receive).toHaveBeenCalledExactlyOnceWith({
      paths: ['/own.md'],
      position: { x: 1, y: 2 },
    })
    api.dispose()
    native.drop?.({ payload: { type: 'drop', paths: ['/late.md'], position: { x: 0, y: 0 } } })
    expect(receive).toHaveBeenCalledOnce()
    expect(native.stopScale).toHaveBeenCalledOnce()
    expect(native.stopClose).toHaveBeenCalledOnce()
    expect(native.stopDrop).toHaveBeenCalledOnce()
  })

  it('acknowledges a successful application flush and unregisters removed close handlers', async () => {
    const events = createEventHub()
    const api = createWindowApis(events)
    const stale = vi.fn()
    api.window.onCloseRequested(stale)()
    const active = vi.fn(async () => undefined)
    api.window.onCloseRequested(active)
    events.publish('window-flush-requested', { requestId: 'quit-success' })
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledWith('window_flush_result', {
        request: { requestId: 'quit-success' },
      }),
    )
    expect(active).toHaveBeenCalledOnce()
    expect(stale).not.toHaveBeenCalled()
    expect(native.invoke).not.toHaveBeenCalledWith('window_close_commit', expect.anything())
    api.dispose()
  })

  it('shares an in-flight editor flush between window close and application quit', async () => {
    const events = createEventHub()
    const api = createWindowApis(events)
    let release: () => void = () => undefined
    let started: () => void = () => undefined
    const began = new Promise<void>((resolve) => {
      started = resolve
    })
    const flush = vi.fn(() => {
      started()
      return new Promise<void>((resolve) => {
        release = resolve
      })
    })
    api.window.onCloseRequested(flush)
    const closing = api.window.close()
    await began
    events.publish('window-flush-requested', { requestId: 'concurrent-quit' })
    expect(flush).toHaveBeenCalledOnce()
    expect(native.invoke).not.toHaveBeenCalled()
    release()
    await closing
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledWith('window_flush_result', {
        request: { requestId: 'concurrent-quit' },
      }),
    )
    expect(native.invoke).toHaveBeenCalledWith('window_close_commit', { request: {} })
    expect(flush).toHaveBeenCalledOnce()
    api.dispose()
  })

  it('contains a failed native flush acknowledgment without closing the owner', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const error = new Error('Acknowledgment unavailable')
    native.invoke.mockRejectedValueOnce(error)
    const events = createEventHub()
    const api = createWindowApis(events)
    api.window.onCloseRequested(() => Promise.reject('Disk conflict'))
    events.publish('window-flush-requested', { requestId: 'quit-failed' })
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith('Native flush acknowledgment failed.', error),
    )
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('window_flush_result', {
      request: { requestId: 'quit-failed', error: 'Disk conflict' },
    })
    api.dispose()
  })

  it('keeps close failures bounded and contains a failed native error dialog', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    native.invoke.mockRejectedValueOnce(new Error('Dialog unavailable'))
    const api = createWindowApis(createEventHub())
    await api.install()
    api.window.onCloseRequested(() => {
      throw new Error('x'.repeat(3000))
    })
    native.closeRequested?.({ preventDefault: vi.fn() })
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith('Window close error dialog failed.', expect.any(Error)),
    )
    expect(native.invoke).toHaveBeenCalledWith('window_report_close_error', {
      request: { message: 'x'.repeat(2048) },
    })
    expect(native.invoke).not.toHaveBeenCalledWith('window_close_commit', expect.anything())
    api.dispose()
  })

  it('reports unexpected flush rejections with the save-failed message and retains the window', async () => {
    const api = createWindowApis(createEventHub())
    await api.install()
    api.window.onCloseRequested(() => Promise.reject({ code: 'DISK_UNAVAILABLE' }))
    native.closeRequested?.({ preventDefault: vi.fn() })
    await vi.waitFor(() =>
      expect(native.invoke).toHaveBeenCalledExactlyOnceWith('window_report_close_error', {
        request: { message: 'Unable to save the workspace before closing.' },
      }),
    )
    api.dispose()
  })

  it('forwards native controls to the current root window', async () => {
    const api = createWindowApis(createEventHub())
    expect(await isTauriWindowVisible()).toBe(true)
    native.window.isMaximized.mockResolvedValue(true)
    await api.window.minimize()
    await api.window.maximize()
    await api.window.unmaximize()
    expect(await api.window.isMaximized()).toBe(true)
    await api.window.startDragging()
    await api.window.setVimKeyboardOwnership(false)
    for (const method of [
      'minimize',
      'maximize',
      'unmaximize',
      'isMaximized',
      'startDragging',
    ] as const)
      expect(native.window[method]).toHaveBeenCalledOnce()
    expect(native.invoke).toHaveBeenCalledWith('window_set_vim_keyboard_ownership', {
      request: { active: false },
    })
    api.dispose()
  })
})
