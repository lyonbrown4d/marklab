import { getCurrentWindow } from '@tauri-apps/api/window'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { DesktopFileDropEvent, DesktopRuntimeApi } from '@/runtime/desktop'
import { request, type TauriEventHub } from '@/runtime/tauri/transport'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

// Keep visibility native and current across attempts that hide/reuse a renderer.
export const isTauriWindowVisible = (): Promise<boolean> => getCurrentWindow().isVisible()

type CloseHandler = () => Promise<void> | void

type NativeWindow = Pick<ReturnType<typeof getCurrentWindow>, 'isMaximized' | 'onResized'>

const watchNativeMaximized = async (
  nativeWindow: NativeWindow,
  handler: (maximized: boolean) => void,
): Promise<() => void> => {
  let active = true
  let readVersion = 0
  let previous: boolean | undefined
  let stop: (() => void) | undefined
  const read = async (): Promise<void> => {
    const version = ++readVersion
    try {
      const maximized = await nativeWindow.isMaximized()
      if (!active || version !== readVersion || previous === maximized) return
      previous = maximized
      handler(maximized)
    } catch (error) {
      if (active && version === readVersion) throw error
    }
  }
  const dispose = () => {
    if (!active) return
    active = false
    readVersion += 1
    stop?.()
  }
  try {
    // Capture this native root, and subscribe before reading restored geometry.
    stop = await nativeWindow.onResized(() => {
      void read().catch((error: unknown) =>
        rendererDiagnostics.warn('window.state', 'maximized-read-failed', error),
      )
    })
    await read()
    return dispose
  } catch (error) {
    dispose()
    throw error
  }
}

export const createWindowApis = (events: TauriEventHub) => {
  const nativeWindow = getCurrentWindow()
  const closeHandlers = new Set<CloseHandler>()
  const dropHandlers = new Set<(event: DesktopFileDropEvent) => void>()
  const unlisten: Array<() => void> = []
  const maximizedSubscriptions = new Set<() => void>()
  let disposed = false
  let closing: Promise<void> | null = null
  let flushing: Promise<void> | null = null
  let scaleFactor = 1

  const flush = (): Promise<void> => {
    if (flushing) return flushing
    flushing = Promise.resolve()
      .then(async () => {
        for (const handler of closeHandlers) await handler()
      })
      .finally(() => {
        flushing = null
      })
    return flushing
  }

  unlisten.push(
    events.on('window-flush-requested', ({ requestId }) => {
      void flush()
        .then(
          () => request('window_flush_result', { requestId }),
          (error: unknown) =>
            request('window_flush_result', {
              requestId,
              error: error instanceof Error ? error.message : String(error),
            }),
        )
        .catch((error: unknown) => console.error('Native flush acknowledgment failed.', error))
    }),
  )

  const close = (): Promise<void> => {
    if (closing) return closing
    const operation = Promise.resolve()
      .then(async () => {
        // Editor buffers must reach Rust before native destruction. A rejected
        // flush leaves the window open and permits a later close retry.
        await flush()
        await request('window_close_commit')
      })
      .finally(() => {
        closing = null
      })
    closing = operation
    return operation
  }

  const windowApi: DesktopRuntimeApi['window'] = {
    setVimKeyboardOwnership: (active) => request('window_set_vim_keyboard_ownership', { active }),
    onPresented: (handler) => events.on('window-presented', handler),
    minimize: () => nativeWindow.minimize(),
    maximize: () => nativeWindow.maximize(),
    unmaximize: () => nativeWindow.unmaximize(),
    isMaximized: () => nativeWindow.isMaximized(),
    onMaximizedChanged: async (handler) => {
      if (disposed) return () => {}
      const stop = await watchNativeMaximized(nativeWindow, (maximized) => {
        if (!disposed) handler(maximized)
      })
      if (disposed) {
        stop()
        return () => {}
      }
      maximizedSubscriptions.add(stop)
      return () => {
        maximizedSubscriptions.delete(stop)
        stop()
      }
    },
    close,
    onCloseRequested: (handler) => {
      closeHandlers.add(handler)
      return () => closeHandlers.delete(handler)
    },
    startDragging: () => nativeWindow.startDragging(),
  }

  return {
    window: windowApi,
    webview: {
      onFileDrop: (handler: (event: DesktopFileDropEvent) => void) => {
        dropHandlers.add(handler)
        return () => dropHandlers.delete(handler)
      },
    },
    install: async (): Promise<void> => {
      try {
        scaleFactor = await nativeWindow.scaleFactor()
        unlisten.push(
          await nativeWindow.onScaleChanged(({ payload }) => {
            scaleFactor = payload.scaleFactor
          }),
        )
        unlisten.push(
          await nativeWindow.onCloseRequested((event) => {
            event.preventDefault()
            void close().catch((error: unknown) => {
              const message =
                error instanceof Error
                  ? error.message
                  : 'Unable to save the workspace before closing.'
              void request('window_report_close_error', { message: message.slice(0, 2048) }).catch(
                (reportError: unknown) =>
                  console.error('Window close error dialog failed.', reportError),
              )
            })
          }),
        )
        unlisten.push(
          await getCurrentWebview().onDragDropEvent(({ payload }) => {
            if (payload.type !== 'drop') return
            // Tauri reports physical pixels; renderer drop targets use CSS pixels.
            const event = {
              paths: payload.paths,
              position: {
                x: payload.position.x / scaleFactor,
                y: payload.position.y / scaleFactor,
              },
            }
            for (const handler of dropHandlers) handler(event)
          }),
        )
        if (!events.has('window-presented') && (await nativeWindow.isVisible())) {
          events.publish('window-presented', null)
        }
      } catch (error) {
        for (const stop of unlisten.splice(0)) stop()
        throw error
      }
    },
    dispose: (): void => {
      disposed = true
      for (const stop of maximizedSubscriptions) stop()
      maximizedSubscriptions.clear()
      for (const stop of unlisten.splice(0)) stop()
      closeHandlers.clear()
      dropHandlers.clear()
    },
  }
}
