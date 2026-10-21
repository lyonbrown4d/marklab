import { Observable } from 'rxjs'
import type { RuntimeEventName, RuntimeEventPayloads } from '@/runtime/tauri/contract'
import {
  listen,
  type RuntimeEvent,
  type RuntimeListenOptions,
  type RuntimeUnlistenFn,
} from '@/runtime/events'

export const fromRuntimeEvent = <E extends RuntimeEventName>(
  eventName: E,
  options?: RuntimeListenOptions,
): Observable<RuntimeEvent<RuntimeEventPayloads[E]>> =>
  new Observable<RuntimeEvent<RuntimeEventPayloads[E]>>((subscriber) => {
    let disposed = false
    let unlisten: RuntimeUnlistenFn | null = null

    void listen(
      eventName,
      (event) => {
        if (!subscriber.closed) subscriber.next(event)
      },
      options,
    )
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten()
          return
        }
        unlisten = nextUnlisten
      })
      .catch((error: unknown) => {
        if (!disposed) subscriber.error(error)
      })

    return () => {
      disposed = true
      unlisten?.()
      unlisten = null
    }
  })
