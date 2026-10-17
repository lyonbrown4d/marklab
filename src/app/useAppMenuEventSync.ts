import { useEffect } from 'react'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { onMenuActionRequest } from '@/utils/appEvents'
import { rendererDiagnostics } from '@/services/rendererDiagnostics'

export const useAppMenuEventSync = (handleMenuAction: (action: string) => void) => {
  useEffect(() => {
    const domHandler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string') handleMenuAction(detail)
    }

    window.addEventListener('marklab:menu-action', domHandler)
    const unsubscribeRendererMenuAction = onMenuActionRequest(handleMenuAction)

    let cancelled = false
    let unlisten: (() => void) | undefined
    if (isDesktopRuntime()) {
      void listen<string>('menu-action', (event) => {
        if (!cancelled) handleMenuAction(event.payload)
      })
        .then((fn) => {
          if (cancelled) fn()
          else unlisten = fn
        })
        .catch((error: unknown) => {
          rendererDiagnostics.warn('app.menu', 'native-menu-subscription-failed', error)
        })
    }

    return () => {
      cancelled = true
      unsubscribeRendererMenuAction()
      window.removeEventListener('marklab:menu-action', domHandler)
      if (unlisten) unlisten()
    }
  }, [handleMenuAction])
}
