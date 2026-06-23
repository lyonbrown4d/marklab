import { useEffect, useRef } from 'react'
import type { Observable } from 'rxjs'

export type ObservableSubscriptionOptions = {
  enabled?: boolean
  onError?: (error: unknown) => void
}

export const useObservableSubscription = <T>(
  source$: Observable<T> | null | undefined,
  onNext: (value: T) => void,
  options: ObservableSubscriptionOptions = {},
) => {
  const onNextRef = useRef(onNext)
  const onErrorRef = useRef(options.onError)

  useEffect(() => {
    onNextRef.current = onNext
    onErrorRef.current = options.onError
  }, [onNext, options.onError])

  useEffect(() => {
    if (!source$ || options.enabled === false) return

    const subscription = source$.subscribe({
      error: (error: unknown) => {
        onErrorRef.current?.(error)
      },
      next: (value) => {
        onNextRef.current(value)
      },
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [options.enabled, source$])
}
