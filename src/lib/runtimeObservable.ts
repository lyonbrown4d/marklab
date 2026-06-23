import { Observable } from 'rxjs'
import {
  listen,
  type RuntimeEvent,
  type RuntimeListenOptions,
  type RuntimeUnlistenFn,
} from '@/runtime/events'

export const fromRuntimeEvent = <T>(
  eventName: string,
  options?: RuntimeListenOptions,
): Observable<RuntimeEvent<T>> =>
  new Observable<RuntimeEvent<T>>((subscriber) => {
    let disposed = false
    let unlisten: RuntimeUnlistenFn | null = null

    void listen<T>(
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
