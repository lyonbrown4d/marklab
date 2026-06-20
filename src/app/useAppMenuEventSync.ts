import { useEffect } from 'react'
import { listen } from '@/runtime/events'
import { isDesktopRuntime } from '@/runtime/environment'
import { onMenuActionRequest } from '@/utils/appEvents'

export const useAppMenuEventSync = (handleMenuAction: (action: string) => void) => {
  useEffect(() => {
    const domHandler = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail
      if (typeof detail === 'string') handleMenuAction(detail)
    }

    window.addEventListener('marklab:menu-action', domHandler)
    const unsubscribeRendererMenuAction = onMenuActionRequest(handleMenuAction)

    let unlisten: (() => void) | undefined
    if (isDesktopRuntime()) {
      void listen<string>('menu-action', (event) => {
        handleMenuAction(event.payload)
      }).then((fn) => {
        unlisten = fn
      })
    }

    return () => {
      unsubscribeRendererMenuAction()
      window.removeEventListener('marklab:menu-action', domHandler)
      if (unlisten) unlisten()
    }
  }, [handleMenuAction])
}
