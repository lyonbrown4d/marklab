import { useState } from 'react'
import type { Observable } from 'rxjs'
import {
  useObservableSubscription,
  type ObservableSubscriptionOptions,
} from '@/hooks/useObservableSubscription'

export type ObservableState<T> = {
  error: unknown | null
  value: T
}

export const useObservableState = <T>(
  source$: Observable<T> | null | undefined,
  initialValue: T,
  options: ObservableSubscriptionOptions = {},
): ObservableState<T> => {
  const [state, setState] = useState<ObservableState<T>>({
    error: null,
    value: initialValue,
  })

  useObservableSubscription(
    source$,
    (value) => {
      setState({ error: null, value })
    },
    {
      ...options,
      onError: (error) => {
        setState((current) => ({ ...current, error }))
        options.onError?.(error)
      },
    },
  )

  return state
}
