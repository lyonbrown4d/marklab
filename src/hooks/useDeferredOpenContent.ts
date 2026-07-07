import { startTransition, useEffect, useState } from 'react'

export const useDeferredOpenContent = (open: boolean) => {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      startTransition(() => setReady(open))
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [open])

  return open && ready
}
