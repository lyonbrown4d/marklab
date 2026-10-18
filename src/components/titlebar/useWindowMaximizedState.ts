import { useEffect } from 'react'
import { onWindowMaximizedChanged } from '@/runtime/window'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

export const useWindowMaximizedState = (
  enabled: boolean,
  setIsMaximized: (maximized: boolean) => void,
): void => {
  useEffect(() => {
    if (!enabled) return
    let canceled = false
    let stop: (() => void) | undefined
    void onWindowMaximizedChanged((maximized) => {
      if (!canceled) setIsMaximized(maximized)
    })
      .then((unlisten) => {
        if (canceled) unlisten()
        else stop = unlisten
      })
      .catch((error: unknown) => {
        if (!canceled)
          rendererDiagnostics.warn('window.state', 'maximized-subscription-failed', error)
      })
    return () => {
      canceled = true
      stop?.()
    }
  }, [enabled, setIsMaximized])
}
