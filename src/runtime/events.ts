import type { EventTarget, Options } from '@tauri-apps/api/event'
import type { RuntimeEventName, RuntimeEventPayloads } from '@/runtime/tauri/contract'
import {
  getDesktopRuntime,
  isDesktopRuntime,
  type DesktopRuntimeEventEnvelope,
} from '@/runtime/desktop'
export type RuntimeUnlistenFn = () => void
export type RuntimeEvent<T> = DesktopRuntimeEventEnvelope<T>
export type RuntimeEventCallback<T> = (event: RuntimeEvent<T>) => void
export type RuntimeEventTarget = EventTarget
export type RuntimeListenOptions = Options
export const listen = <E extends RuntimeEventName>(
  event: E,
  handler: RuntimeEventCallback<RuntimeEventPayloads[E]>,
  options?: RuntimeListenOptions,
): Promise<RuntimeUnlistenFn> => {
  void options
  const desktop = isDesktopRuntime() ? getDesktopRuntime() : null
  if (desktop) {
    return Promise.resolve(desktop.events.listen(event, handler))
  }
  if (typeof window !== 'undefined') {
    const domEventName = `marklab:${event}`
    const listener = (domEvent: Event) => {
      handler(toRuntimeEvent(event, (domEvent as CustomEvent<RuntimeEventPayloads[E]>).detail))
    }
    window.addEventListener(domEventName, listener)
    return Promise.resolve(() => window.removeEventListener(domEventName, listener))
  }
  return Promise.resolve(() => {})
}
export const emit = <E extends RuntimeEventName>(
  event: E,
  payload: RuntimeEventPayloads[E],
): Promise<void> => {
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
