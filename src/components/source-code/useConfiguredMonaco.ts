import { useEffect, useState } from 'react'

export const useConfiguredMonaco = () => {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    let cancelled = false

    void import('@/lib/monaco')
      .then(({ configureMonaco }) => configureMonaco())
      .then(() => {
        if (!cancelled) setReady(true)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError)
      })

    return () => {
      cancelled = true
    }
  }, [])

  return { error, ready }
}
