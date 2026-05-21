import { getElectronRuntime } from '@/runtime/electron'
export type RuntimeUnlistenFn = () => void
export type RuntimeEvent<T> = {
  event: string
  id: number
  payload: T
}
export type RuntimeEventCallback<T> = (event: RuntimeEvent<T>) => void
export type RuntimeEventTarget =
  | {
      kind: 'Any'
    }
  | {
      kind: 'AnyLabel'
      label: string
    }
  | {
      kind: 'App'
    }
  | {
      kind: 'Window'
      label: string
    }
  | {
      kind: 'Webview'
      label: string
    }
  | {
      kind: 'WebviewWindow'
      label: string
    }
export type RuntimeListenOptions = {
  target?: string | RuntimeEventTarget
}
export const listen = <T>(
  event: string,
  handler: RuntimeEventCallback<T>,
  options?: RuntimeListenOptions,
): Promise<RuntimeUnlistenFn> => {
  void options
  const electron = getElectronRuntime()
  if (electron?.events?.listen) {
    return Promise.resolve(electron.events.listen<T>(event, handler))
  }
  if (event === 'menu-action' && electron?.menu.onCommand) {
    return Promise.resolve(
      electron.menu.onCommand((id) => {
        handler(toRuntimeEvent(event, id as T))
      }),
    )
  }
  if (typeof window !== 'undefined') {
    const domEventName = `marko:${event}`
    const listener = (domEvent: Event) => {
      handler(toRuntimeEvent(event, (domEvent as CustomEvent<T>).detail))
    }
    window.addEventListener(domEventName, listener)
    return Promise.resolve(() => window.removeEventListener(domEventName, listener))
  }
  return Promise.resolve(() => {})
}
export const emit = <T>(event: string, payload?: T): Promise<void> => {
  const electron = getElectronRuntime()
  if (electron?.events?.emit) {
    return Promise.resolve(electron.events.emit(event, payload))
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(`marko:${event}`, { detail: payload }))
  }
  return Promise.resolve()
}
const toRuntimeEvent = <T>(event: string, payload: T): RuntimeEvent<T> => ({
  event,
  id: 0,
  payload,
})
