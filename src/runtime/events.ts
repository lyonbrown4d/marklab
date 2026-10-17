import { getDesktopRuntime, isDesktopRuntime } from '@/runtime/desktop'
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
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (desktop) {
    return Promise.resolve(desktop.events.listen<T>(event, handler))
  }
  if (typeof window !== 'undefined') {
    const domEventName = `marklab:${event}`
    const listener = (domEvent: Event) => {
      handler(toRuntimeEvent(event, (domEvent as CustomEvent<T>).detail))
    }
    window.addEventListener(domEventName, listener)
    return Promise.resolve(() => window.removeEventListener(domEventName, listener))
  }
  return Promise.resolve(() => {})
}
export const emit = <T>(event: string, payload?: T): Promise<void> => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(`marklab:${event}`, { detail: payload }))
  }
  return Promise.resolve()
}
const toRuntimeEvent = <T>(event: string, payload: T): RuntimeEvent<T> => ({
  event,
  id: 0,
  payload,
})
